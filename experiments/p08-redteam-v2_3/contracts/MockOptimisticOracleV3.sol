// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Subset of UMA's OptimisticOracleV3Interface used by PaprikaV2. Function names and argument lists follow
/// UMA (as copied in p02-uma-oov3-feasibility/contracts/BanByAssertion.sol). Deviation: `assertTruth` and
/// `disputeAssertion` are payable here because the mock takes the bond in native ETH (currency = address(0));
/// real OOv3 pulls a whitelisted ERC-20 bond with transferFrom.
interface IOptimisticOracleV3 {
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external payable returns (bytes32);
    function disputeAssertion(bytes32 assertionId, address disputer) external payable;
    function settleAssertion(bytes32 assertionId) external;
    function defaultIdentifier() external view returns (bytes32);
}

/// Callbacks exactly as in UMA's OptimisticOracleV3CallbackRecipientInterface.
interface IOptimisticOracleV3CallbackRecipient {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
    function assertionDisputedCallback(bytes32 assertionId) external;
}

/// Mock: assert with bond -> liveness -> settle (truthful), or dispute (matching bond) -> the test plays the
/// DVM vote with `resolveDispute` -> settle. Winner of a dispute gets both bonds (real UMA burns part of the
/// loser's bond to its Store; ignored here).
contract MockOptimisticOracleV3 is IOptimisticOracleV3 {
    struct Assertion {
        address asserter; address callbackRecipient; address disputer;
        uint64 expiry; uint256 bond; bool settled; bool dvmResolved; bool dvmTruth;
    }
    address public immutable dvm;                 // the account that plays the token-holder vote
    mapping(bytes32 => Assertion) public assertions;
    uint256 public openBonds;                     // sum of bonds held for unsettled assertions
    uint256 private nonce;

    constructor() { dvm = msg.sender; }

    function defaultIdentifier() external pure returns (bytes32) { return "ASSERT_TRUTH"; }

    function assertTruth(bytes memory claim, address asserter, address callbackRecipient, address, uint64 liveness,
        address currency, uint256 bond, bytes32, bytes32) external payable returns (bytes32 id) {
        require(currency == address(0) && msg.value == bond && bond > 0, "bond");
        id = keccak256(abi.encode(claim, asserter, block.timestamp, nonce++));
        assertions[id] = Assertion(asserter, callbackRecipient, address(0), uint64(block.timestamp) + liveness, bond, false, false, false);
        openBonds += bond;
    }

    function disputeAssertion(bytes32 id, address disputer) external payable {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && a.disputer == address(0) && !a.settled, "not disputable");
        require(block.timestamp < a.expiry, "liveness over");
        require(msg.value == a.bond, "bond");
        a.disputer = disputer;
        openBonds += msg.value;
        if (a.callbackRecipient != address(0)) IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionDisputedCallback(id);
    }

    function resolveDispute(bytes32 id, bool truthful) external {
        require(msg.sender == dvm, "only dvm");
        Assertion storage a = assertions[id];
        require(a.disputer != address(0) && !a.dvmResolved, "no dispute");
        a.dvmResolved = true; a.dvmTruth = truthful;
    }

    function settleAssertion(bytes32 id) external {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && !a.settled, "not settleable");
        bool truthful; address winner; uint256 amount;
        if (a.disputer == address(0)) {
            require(block.timestamp >= a.expiry, "liveness");
            truthful = true; winner = a.asserter; amount = a.bond;
        } else {
            require(a.dvmResolved, "dvm pending");
            truthful = a.dvmTruth; winner = truthful ? a.asserter : a.disputer; amount = 2 * a.bond;
        }
        a.settled = true;
        openBonds -= amount;
        (bool ok, ) = winner.call{value: amount}(""); require(ok, "pay");
        if (a.callbackRecipient != address(0)) IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionResolvedCallback(id, truthful);
    }
}
