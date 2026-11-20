// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./PaprikaV2_3.sol";

/// A claimant that is a contract and refuses ETH unless `accept` is set (push payment from the oracle reverts).
contract RevertingClaimant {
    PaprikaV2_3 public immutable p;
    bool public accept;
    constructor(PaprikaV2_3 _p) { p = _p; }
    function setAccept(bool a) external { accept = a; }
    function commit(bytes32 c) external payable { p.commitClaim{value: msg.value}(c); }
    function reveal(bytes32 H, bytes32 k, bytes32 e, bytes32 s) external returns (bytes32) { return p.revealClaim(H, k, e, s); }
    receive() external payable { require(accept, "no ETH"); }
}

/// Stand-in for the bond interface of the real OOv3: assertTruth / disputeAssertion are NOT payable
/// (real OOv3 pulls a whitelisted ERC-20 bond with safeTransferFrom). Only the payability matters here.
contract NonPayableOOv3 {
    function defaultIdentifier() external pure returns (bytes32) { return "ASSERT_TRUTH"; }
    function assertTruth(bytes memory, address, address, address, uint64, address, uint256, bytes32, bytes32)
        external pure returns (bytes32) { return keccak256("x"); }
    function disputeAssertion(bytes32, address) external {}
    function settleAssertion(bytes32) external {}
}

/// Forces ETH into a contract without calling it (SELFDESTRUCT in the creating transaction still transfers, EIP-6780).
contract ForceSend {
    constructor(address payable to) payable { selfdestruct(to); }
}
