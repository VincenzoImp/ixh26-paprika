// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockOracle.sol";

/// Most literal reading of proposal/PAPRIKA.md. Every choice where the text is silent is
/// listed in README.md ("Spec gaps and the reading chosen"). Gap numbers (G#) refer to it.
contract PaprikaBaseline is IClaimTarget {
    MockOracle public immutable oracle;
    uint256 public immutable attestFee;          // G7: fixed fee per attestation
    uint256 public immutable reward;             // G8: fixed reward per successful claim
    bool public immutable banInvalidatesPast;    // G6: the two ban readings

    struct Device { address owner; bool banned; }       // G1: device = keccak256(pubKey)
    struct Attestation { bytes32 deviceId; uint64 time; }
    struct Claim { address claimant; bytes32 photo; bytes32 deviceId; }

    mapping(bytes32 => Device) public devices;
    mapping(bytes32 => Attestation) public attestations; // G5: one record per hash, first wins
    mapping(uint256 => Claim) public claims;             // oracle request id => claim

    event Registered(bytes32 indexed deviceId, address indexed owner, bytes pubKey);
    event Attested(bytes32 indexed photoHash, bytes32 indexed deviceId);
    event Claimed(uint256 indexed claimId, address indexed claimant, bytes32 photo, bytes32 deviceId);
    event Banned(bytes32 indexed deviceId, address indexed claimant, uint256 paid);

    constructor(MockOracle _oracle, uint256 _attestFee, uint256 _reward, bool _banInvalidatesPast) payable {
        oracle = _oracle; attestFee = _attestFee; reward = _reward; banInvalidatesPast = _banInvalidatesPast;
    }

    /// "An Ethereum account needs to register it, with its own public key. Fails if the device is banned."
    /// G2: no proof of possession of the key is required (the text asks for none).
    function register(bytes calldata pubKey) external returns (bytes32 id) {
        id = keccak256(pubKey);
        require(!devices[id].banned, "banned");
        require(devices[id].owner == address(0), "already registered"); // G3
        devices[id].owner = msg.sender;
        emit Registered(id, msg.sender, pubKey);
    }

    /// "Device pays a fee to the treasury, sends SHA(photo); saved if the device is not banned."
    /// G4: sent by the account that registered the device; no device signature (none in the text).
    function attest(bytes32 deviceId, bytes32 photoHash) external payable {
        Device storage d = devices[deviceId];
        require(d.owner != address(0), "unregistered");
        require(d.owner == msg.sender, "not device owner");
        require(!d.banned, "banned");
        require(msg.value == attestFee, "fee");
        require(attestations[photoHash].time == 0, "already attested"); // G5
        attestations[photoHash] = Attestation(deviceId, uint64(block.timestamp));
        emit Attested(photoHash, deviceId);
    }

    /// Verification: is this hash attested (and by which device)?
    function verify(bytes32 photoHash) external view returns (bool ok, bytes32 deviceId) {
        Attestation memory a = attestations[photoHash];
        if (a.time == 0) return (false, bytes32(0));
        if (banInvalidatesPast && devices[a.deviceId].banned) return (false, a.deviceId);
        return (true, a.deviceId);
    }

    /// "An account claims photo A of device B is fake, pays the UMA fee."
    /// G9: no on-chain check that A was attested by B, or that B is not already banned; anyone may claim.
    function claimFake(bytes32 photo, bytes32 deviceId) external payable returns (uint256 id) {
        id = oracle.request{value: msg.value}();
        claims[id] = Claim(msg.sender, photo, deviceId);
        emit Claimed(id, msg.sender, photo, deviceId);
    }

    /// "Yes: device gets banned and the account gets ETH as a reward. No: nothing happens."
    /// G8: reward paid from the treasury (this contract's balance), capped at the balance.
    function onClaimResolved(uint256 id, bool isFake) external {
        require(msg.sender == address(oracle), "only oracle");
        if (!isFake) return;
        Claim memory c = claims[id];
        devices[c.deviceId].banned = true;
        uint256 pay = reward < address(this).balance ? reward : address(this).balance;
        if (pay > 0) { (bool s, ) = c.claimant.call{value: pay}(""); require(s, "pay"); }
        emit Banned(c.deviceId, c.claimant, pay);
    }

    // G10: the text defines no treasury withdrawal; there is none. Only outflow: rewards.
    receive() external payable {}
}
