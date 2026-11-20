// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./PaprikaV2_5.sol";

/// Ported from ../p08-redteam-v2_3/contracts/RedTeamHelpers.sol (R-04): a claimant contract that refuses ETH.
contract RevertingClaimantV2_5 {
    PaprikaV2_5 public immutable p;
    constructor(PaprikaV2_5 _p) { p = _p; }
    function commit(bytes32 c) external payable { p.commitClaim{value: msg.value}(c); }
    function reveal(bytes32 H, bytes32 k, bytes32 e, bytes32 s) external returns (bytes32) { return p.revealClaim(H, k, e, s); }
    function collect() external { p.claimCredit(); }
    receive() external payable { revert("no ETH"); }
}

/// Ported (R-05): the bond interface of the real OOv3 - assertTruth / disputeAssertion are NOT payable.
contract NonPayableOOv3V2_5 {
    function defaultIdentifier() external pure returns (bytes32) { return "ASSERT_TRUTH"; }
    function assertTruth(bytes memory, address, address, address, uint64, address, uint256, bytes32, bytes32)
        external pure returns (bytes32) { return keccak256("x"); }
    function disputeAssertion(bytes32, address) external {}
    function settleAssertion(bytes32) external {}
}
