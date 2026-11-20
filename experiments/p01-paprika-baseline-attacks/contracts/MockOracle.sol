// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IClaimTarget {
    function onClaimResolved(uint256 claimId, bool isFake) external;
}

/// Stand-in for UMA: a claim is filed with a fee; the "voter" (the test) resolves it true/false.
/// The fee stays in the oracle (paid to the voters), whatever the outcome.
contract MockOracle {
    address public immutable voter;
    uint256 public immutable fee;

    struct Req { address target; bool resolved; }
    Req[] public requests;

    constructor(uint256 _fee) { voter = msg.sender; fee = _fee; }

    function request() external payable returns (uint256 id) {
        require(msg.value == fee, "oracle fee");
        requests.push(Req(msg.sender, false));
        return requests.length - 1;
    }

    /// The test plays the token-holder vote.
    function resolve(uint256 id, bool isFake) external {
        require(msg.sender == voter, "not voter");
        Req storage r = requests[id];
        require(!r.resolved, "resolved");
        r.resolved = true;
        IClaimTarget(r.target).onClaimResolved(id, isFake);
    }
}
