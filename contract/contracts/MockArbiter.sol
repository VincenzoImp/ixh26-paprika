// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Paprika.sol";

/// Test stand-in for UMA's Optimistic Oracle V3 (same callback interface). The deployer plays the token-holder vote
/// (`resolveDispute`). A resolved dispute pays like real OOv3: oracleFee = burnedBondPercentage (50%) x bond goes to
/// the Store (burned from the protocol's point of view); the winner gets 2 x bond - oracleFee (its own bond back +
/// half of the loser's). Undisputed: the asserter gets its bond back.
contract MockArbiter is IOptimisticOracleV3 {
    struct Assertion {
        address asserter; address callbackRecipient; address disputer;
        uint64 expiry; uint256 bond; bool settled; bool dvmResolved; bool dvmTruth;
    }
    address public constant STORE = 0x0000000000000000000000000000000000057073; // stands in for UMA's Store
    uint256 public constant BURNED_BOND_PERCENTAGE = 0.5e18;
    address public immutable dvm;                 // the account that plays the token-holder vote
    mapping(bytes32 => Assertion) public assertions;
    uint256 public openBonds;                     // sum of bonds held for unsettled assertions
    uint256 private nonce;

    constructor() { dvm = msg.sender; }

    function defaultIdentifier() external pure returns (bytes32) { return "ASSERT_TRUTH"; }

    /// Opens an assertion; the bond is paid in ETH.
    function assertTruth(bytes memory claim, address asserter, address callbackRecipient, address, uint64 liveness,
        address currency, uint256 bond, bytes32, bytes32) external payable returns (bytes32 id) {
        require(currency == address(0) && msg.value == bond && bond > 0, "bond");
        id = keccak256(abi.encode(claim, asserter, block.timestamp, nonce++));
        assertions[id] = Assertion(asserter, callbackRecipient, address(0), uint64(block.timestamp) + liveness, bond, false, false, false);
        openBonds += bond;
    }

    /// Disputes an assertion within its liveness with a matching bond.
    function disputeAssertion(bytes32 id, address disputer) external payable {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && a.disputer == address(0) && !a.settled, "not disputable");
        require(block.timestamp < a.expiry, "liveness over");
        require(msg.value == a.bond, "bond");
        a.disputer = disputer;
        openBonds += msg.value;
        if (a.callbackRecipient != address(0)) IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionDisputedCallback(id);
    }

    /// The vote (test only).
    function resolveDispute(bytes32 id, bool truthful) external {
        require(msg.sender == dvm, "only dvm");
        Assertion storage a = assertions[id];
        require(a.disputer != address(0) && !a.dvmResolved, "no dispute");
        a.dvmResolved = true; a.dvmTruth = truthful;
    }

    /// Anyone: pays the winner, the fee to the Store, then calls back the recipient.
    function settleAssertion(bytes32 id) external {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && !a.settled, "not settleable");
        bool truthful; address winner; uint256 amount; uint256 fee;
        if (a.disputer == address(0)) {
            require(block.timestamp >= a.expiry, "liveness");
            truthful = true; winner = a.asserter; amount = a.bond;
        } else {
            require(a.dvmResolved, "dvm pending");
            truthful = a.dvmTruth; winner = truthful ? a.asserter : a.disputer;
            fee = a.bond * BURNED_BOND_PERCENTAGE / 1e18; amount = 2 * a.bond - fee;
        }
        a.settled = true;
        openBonds -= amount + fee;
        if (fee > 0) { (bool okf, ) = STORE.call{value: fee}(""); require(okf, "fee"); }
        (bool ok, ) = winner.call{value: amount}(""); require(ok, "pay");
        if (a.callbackRecipient != address(0)) IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionResolvedCallback(id, truthful);
    }
}
