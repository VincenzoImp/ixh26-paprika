// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Subset of UMA's OptimisticOracleV3Interface (signatures copied from UMA's source).
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
    ) external returns (bytes32);
    function disputeAssertion(bytes32 assertionId, address disputer) external;
    function defaultIdentifier() external view returns (bytes32);
}

interface IERC20 {
    function approve(address, uint256) external returns (bool);
}

/// Test consumer: asserts and disputes its own claim in one transaction, paying both bonds from its balance,
/// and records UMA's callbacks.
contract Probe {
    IOptimisticOracleV3 public immutable oo;
    IERC20 public immutable currency;

    bytes32 public lastAssertionId;
    bytes32 public disputedId;
    uint256 public disputedCount;
    bytes32 public resolvedId;
    bool public resolvedTruthfully;
    uint256 public resolvedCount;

    event Disputed(bytes32 indexed assertionId);
    event Resolved(bytes32 indexed assertionId, bool assertedTruthfully);

    constructor(address _oo, address _currency) {
        oo = IOptimisticOracleV3(_oo);
        currency = IERC20(_currency);
    }

    function assertAndDispute(bytes calldata claim, uint256 bond, uint64 liveness) external returns (bytes32 id) {
        // OOv3 pulls the bond with transferFrom twice (assert + dispute), both from this contract.
        require(currency.approve(address(oo), bond * 2), "approve failed");
        id = oo.assertTruth(
            claim,
            address(this), // asserter: receives bond back / winnings if true
            address(this), // callbackRecipient
            address(0), // no escalation manager: UMA's oracle (here the mock) arbitrates
            liveness,
            address(currency),
            bond,
            oo.defaultIdentifier(),
            bytes32(0)
        );
        lastAssertionId = id;
        oo.disputeAssertion(id, address(this)); // disputer: receives winnings if false
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        require(msg.sender == address(oo), "only OO");
        disputedId = assertionId;
        disputedCount++;
        emit Disputed(assertionId);
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        require(msg.sender == address(oo), "only OO");
        resolvedId = assertionId;
        resolvedTruthfully = assertedTruthfully;
        resolvedCount++;
        emit Resolved(assertionId, assertedTruthfully);
    }
}
