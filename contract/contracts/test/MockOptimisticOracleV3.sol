// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Paprika.sol";

/// TEST ONLY: a stand-in for UMA's Optimistic Oracle V3 with the same interface and the same payouts on the disputed
/// path. `resolve` plays UMA's vote and ANY account may call it. Undisputed assertions are not modelled.
/// settleAssertion: burnedBondPercentage x bond goes to the Store; the winner (asserter if true, disputer if false)
/// gets 2 x bond minus that fee; then the callback recipient is called.
contract MockOptimisticOracleV3 is IOptimisticOracleV3 {
    struct Assertion {
        address asserter; address callbackRecipient; address disputer; IERC20 currency; uint256 bond;
        bool resolved; bool truthful; bool settled;
    }

    uint256 public constant burnedBondPercentage = 0.5e18;
    address public immutable store;
    uint256 public immutable minimumBond;
    mapping(bytes32 => Assertion) public assertions;
    uint256 private nonce;

    event AssertionMade(bytes32 indexed assertionId, bytes claim, address asserter, uint256 bond);

    constructor(address store_, uint256 minimumBond_) { (store, minimumBond) = (store_, minimumBond_); }

    function defaultIdentifier() external pure returns (bytes32) { return "ASSERT_TRUTH"; }
    function getMinimumBond(address) external view returns (uint256) { return minimumBond; }

    function assertTruth(bytes memory claim, address asserter, address callbackRecipient, address, uint64, IERC20 currency,
        uint256 bond, bytes32, bytes32) external returns (bytes32 id) {
        require(bond >= minimumBond, "bond too low");
        id = keccak256(abi.encode(claim, asserter, block.timestamp, nonce++));
        assertions[id] = Assertion(asserter, callbackRecipient, address(0), currency, bond, false, false, false);
        emit AssertionMade(id, claim, asserter, bond);
        require(currency.transferFrom(msg.sender, address(this), bond), "bond");
    }

    function disputeAssertion(bytes32 id, address disputer) external {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && a.disputer == address(0) && disputer != address(0), "not disputable");
        a.disputer = disputer;
        require(a.currency.transferFrom(msg.sender, address(this), a.bond), "bond");
        if (a.callbackRecipient != address(0)) IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionDisputedCallback(id);
    }

    /// The vote (simulated): anyone, once per disputed assertion.
    function resolve(bytes32 id, bool truthful) external {
        Assertion storage a = assertions[id];
        require(a.disputer != address(0) && !a.resolved, "not resolvable");
        (a.resolved, a.truthful) = (true, truthful);
    }

    function settleAssertion(bytes32 id) external {
        Assertion storage a = assertions[id];
        require(a.resolved && !a.settled, "not settleable");
        a.settled = true;
        uint256 fee = a.bond * burnedBondPercentage / 1e18;
        require(a.currency.transfer(store, fee), "fee");
        require(a.currency.transfer(a.truthful ? a.asserter : a.disputer, 2 * a.bond - fee), "pay");
        if (a.callbackRecipient != address(0)) IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionResolvedCallback(id, a.truthful);
    }
}
