// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Paprika.sol";

/// Test helper: a claimant contract that refuses ETH (its settlement must not block anyone else).
contract RevertingClaimant {
    Paprika public immutable p;
    constructor(Paprika _p) { p = _p; }
    function commit(bytes32 c) external payable { p.commitClaim{value: msg.value}(c); }
    function reveal(bytes32 H, bytes32 k, bytes32 e, bytes32 s) external returns (bytes32) { return p.revealClaim(H, k, e, s); }
    function collect() external { p.claimCredit(); }
    receive() external payable { revert("no ETH"); }
}

/// Test helper: the bond interface of the real OOv3 - assertTruth / disputeAssertion are NOT payable.
contract NonPayableOOv3 {
    function defaultIdentifier() external pure returns (bytes32) { return "ASSERT_TRUTH"; }
    function assertTruth(bytes memory, address, address, address, uint64, address, uint256, bytes32, bytes32)
        external pure returns (bytes32) { return keccak256("x"); }
    function disputeAssertion(bytes32, address) external {}
    function settleAssertion(bytes32) external {}
}
