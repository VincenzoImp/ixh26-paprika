// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockOptimisticOracleV3.sol";

/// Paprika v2.1 = v2 (PaprikaV2.sol, kept unchanged) plus:
///  A. an open claim has priority on the stake over a misuse proof (the misuse prover is paid only if the claim fails);
///  B. no "first attester" field: each (photo, key) record stands alone;
///  C. verify() exposes the stake at risk and the block at which the stake was withdrawn;
///  D. AUTO_DISPUTE: the contract disputes every claim with a bond taken from the device's stake, so a flag
///     always needs an affirmative oracle vote (one open claim per device in this mode).
/// No owner, no admin, no upgrade, no treasury. Choices marked D# are explained in README.md.
contract PaprikaV2_1 is IOptimisticOracleV3CallbackRecipient {
    uint256 public constant MIN_STAKE = 0.1 ether;
    uint256 public constant REWARD_BPS = 5000;
    uint256 public constant UNBONDING_PERIOD = 7 days;
    uint256 public constant CLAIM_BOND = 0.05 ether;
    uint64 public constant LIVENESS = 2 hours;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    address private constant P256 = 0x0000000000000000000000000000000000000100;

    enum Status { None, Active, Flagged, Retired }
    enum Reason { None, KeyMisuse, DisputeUpheld }
    enum Verdict { None, UpheldFake }

    struct Device {
        address owner; Status status; Reason flagReason; uint32 openClaims;
        uint64 flaggedAtBlock; uint64 unbondAt; uint64 withdrawnAtBlock;
        uint256 stake;                 // free stake (excludes a dispute bond currently held by the oracle)
        bytes32 x; bytes32 y;
    }
    struct Record { uint64 anchorBlock; uint64 recordedBlock; Verdict verdict; bool claimOpen; }
    struct Claim { bytes32 photoHash; bytes32 keyId; address claimant; }

    IOptimisticOracleV3 public immutable oracle;
    bool public immutable AUTO_DISPUTE;
    mapping(bytes32 => Device) public devices;
    mapping(bytes32 => mapping(bytes32 => Record)) public records;   // photoHash => keyId => record
    mapping(bytes32 => Claim) public claims;                         // assertionId => claim
    mapping(bytes32 => address) public pendingMisuseProver;          // A: keyId => prover waiting for open claims
    mapping(address => uint256) public credit;                       // pull payments for rewards
    uint256 public inbox;                                            // D9: dispute winnings received from the oracle, same tx

    event Registered(bytes32 indexed keyId, address indexed owner, uint256 stake);
    event Attested(bytes32 indexed photoHash, bytes32 indexed keyId, uint64 anchorBlock, uint256 deposit);
    event Flagged(bytes32 indexed keyId, Reason reason);
    event Slashed(bytes32 indexed keyId, address indexed beneficiary, uint256 reward, uint256 burned);
    event MisusePending(bytes32 indexed keyId, address indexed prover);
    event ClaimOpened(bytes32 indexed assertionId, bytes32 indexed photoHash, bytes32 indexed keyId, address claimant, bytes32 evidenceHash);
    event ClaimResolved(bytes32 indexed assertionId, bool upheld);
    event UnbondRequested(bytes32 indexed keyId, uint64 unbondAt);
    event Withdrawn(bytes32 indexed keyId, uint256 amount);

    constructor(IOptimisticOracleV3 _oracle, bool autoDispute) { oracle = _oracle; AUTO_DISPUTE = autoDispute; }

    /// Only the oracle may send ETH (dispute winnings of the device's auto-dispute bond).
    receive() external payable {
        require(msg.sender == address(oracle), "only oracle");
        inbox += msg.value;
    }

    // ---------------------------------------------------------------- registration
    function register(bytes32 x, bytes32 y, bytes calldata popSig) external payable returns (bytes32 keyId) {
        require(msg.value >= MIN_STAKE, "stake");
        keyId = sha256(abi.encodePacked(x, y));
        require(devices[keyId].status == Status.None, "key used");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA-V2/REGISTER", block.chainid, address(this), msg.sender));
        require(_p256(m, popSig, x, y), "bad pop");
        devices[keyId] = Device(msg.sender, Status.Active, Reason.None, 0, 0, 0, 0, msg.value, x, y);
        emit Registered(keyId, msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- attestation (any relayer may send)
    function attest(bytes32 photoHash, uint256 anchorBlock, bytes32 keyId, bytes calldata sig) external payable {
        Device storage d = devices[keyId];
        require(d.status == Status.Active, "not active");
        bytes32 bh = blockhash(anchorBlock);
        require(bh != 0, "anchor");
        Record storage r = records[photoHash][keyId];
        require(r.recordedBlock == 0, "exists");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA-V2/CAPTURE", block.chainid, address(this), photoHash, bh));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        r.anchorBlock = uint64(anchorBlock);
        r.recordedBlock = uint64(block.number);
        if (msg.value > 0) d.stake += msg.value;
        emit Attested(photoHash, keyId, uint64(anchorBlock), msg.value);
    }

    // ---------------------------------------------------------------- objective challenge
    function proveKeyMisuse(bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status != Status.None, "unknown");
        require(!(d.status == Status.Flagged && d.flagReason == Reason.KeyMisuse), "already misuse");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA-V2/EXTRACTED", block.chainid, address(this), msg.sender));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        _flag(d, keyId, Reason.KeyMisuse);
        if (d.openClaims > 0) {                       // A: open claims keep priority on the stake
            pendingMisuseProver[keyId] = msg.sender;
            emit MisusePending(keyId, msg.sender);
        } else {
            _slash(d, keyId, msg.sender);
        }
    }

    // ---------------------------------------------------------------- subjective challenge (optimistic oracle)
    function claimFake(bytes32 photoHash, bytes32 keyId, bytes32 evidenceHash) external payable returns (bytes32 id) {
        Record storage r = records[photoHash][keyId];
        Device storage d = devices[keyId];
        require(r.recordedBlock != 0, "no record");
        require(r.verdict == Verdict.None, "has verdict");
        require(!r.claimOpen, "claim open");
        require(msg.value == CLAIM_BOND, "bond");
        if (AUTO_DISPUTE) {
            require(d.openClaims == 0, "device busy");               // D: stake never over-committed
            require(d.stake >= CLAIM_BOND, "stake < bond");
            d.stake -= CLAIM_BOND;                                    // moves to the oracle as the dispute bond
        }
        r.claimOpen = true;
        d.openClaims++;
        bytes memory text = abi.encodePacked("PAPRIKA-V2: the photo with sha256 ", photoHash, " attested by key ", keyId,
            " on ", address(this), " is not a genuine capture of that device; evidence sha256 ", evidenceHash);
        id = oracle.assertTruth{value: msg.value}(text, msg.sender, address(this), address(0), LIVENESS, address(0),
            CLAIM_BOND, oracle.defaultIdentifier(), bytes32(0));
        claims[id] = Claim(photoHash, keyId, msg.sender);
        emit ClaimOpened(id, photoHash, keyId, msg.sender, evidenceHash);
        if (AUTO_DISPUTE) oracle.disputeAssertion{value: CLAIM_BOND}(id, address(this));
    }

    /// Must never revert (a revert would freeze UMA settlement and the bonds).
    function assertionResolvedCallback(bytes32 id, bool truthful) external {
        require(msg.sender == address(oracle), "only oracle");
        Claim memory c = claims[id];
        uint256 won = inbox;
        inbox = 0;
        if (c.claimant == address(0)) { if (won > 0) _send(BURN, won); return; }   // unreachable in practice
        delete claims[id];
        Record storage r = records[c.photoHash][c.keyId];
        Device storage d = devices[c.keyId];
        r.claimOpen = false;
        d.openClaims--;
        d.stake += won;                                   // D: rejected claim -> device's bond back + half the claimant's
        if (truthful) {
            r.verdict = Verdict.UpheldFake;
            delete pendingMisuseProver[c.keyId];          // A: the claimant has priority over a pending misuse proof
            _flag(d, c.keyId, Reason.DisputeUpheld);
            _slash(d, c.keyId, c.claimant);
        } else if (d.openClaims == 0 && pendingMisuseProver[c.keyId] != address(0)) {
            address p = pendingMisuseProver[c.keyId];
            delete pendingMisuseProver[c.keyId];
            _slash(d, c.keyId, p);                        // A: claim failed -> the misuse prover is paid now
        }
        emit ClaimResolved(id, truthful);
    }

    function assertionDisputedCallback(bytes32) external view {
        require(msg.sender == address(oracle), "only oracle");
    }

    // ---------------------------------------------------------------- exit
    function requestUnbond(bytes32 keyId) external {
        Device storage d = devices[keyId];
        require(msg.sender == d.owner, "not owner");
        require(d.status == Status.Active, "not active");
        d.status = Status.Retired;
        d.unbondAt = uint64(block.timestamp + UNBONDING_PERIOD);
        emit UnbondRequested(keyId, d.unbondAt);
    }

    function withdraw(bytes32 keyId) external {
        Device storage d = devices[keyId];
        require(msg.sender == d.owner, "not owner");
        require(d.status == Status.Retired, "not retired");
        require(block.timestamp >= d.unbondAt, "unbonding");
        require(d.openClaims == 0, "open claims");
        uint256 amt = d.stake;
        require(amt > 0, "nothing");
        d.stake = 0;
        d.withdrawnAtBlock = uint64(block.number);
        _send(msg.sender, amt);
        emit Withdrawn(keyId, amt);
    }

    function claimCredit() external {
        uint256 amt = credit[msg.sender];
        require(amt > 0, "nothing");
        credit[msg.sender] = 0;
        _send(msg.sender, amt);
    }

    // ---------------------------------------------------------------- verification
    struct View {
        uint64 anchorBlock; uint64 recordedBlock; Verdict verdict;
        Status status; uint64 flaggedAtBlock; Reason flagReason; uint256 stake; bool recordedBeforeFlag;
        uint256 stakeAtRisk; uint64 withdrawnAtBlock; bool misusePending;
    }
    /// C: stakeAtRisk = free stake + dispute bond held by the oracle; withdrawnAtBlock = 0 while bonded.
    function verify(bytes32 photoHash, bytes32 keyId) external view returns (View memory v) {
        Record memory r = records[photoHash][keyId];
        Device memory d = devices[keyId];
        uint256 committed = AUTO_DISPUTE ? uint256(d.openClaims) * CLAIM_BOND : 0;
        v = View(r.anchorBlock, r.recordedBlock, r.verdict, d.status, d.flaggedAtBlock, d.flagReason, d.stake,
            r.recordedBlock != 0 && (d.status != Status.Flagged || r.recordedBlock < d.flaggedAtBlock),
            d.stake + committed, d.withdrawnAtBlock, pendingMisuseProver[keyId] != address(0));
    }

    // ---------------------------------------------------------------- internals
    function _flag(Device storage d, bytes32 keyId, Reason reason) internal {
        if (d.status != Status.Flagged) d.flaggedAtBlock = uint64(block.number);   // earliest flag kept
        d.status = Status.Flagged;
        if (d.flagReason != Reason.KeyMisuse) d.flagReason = reason;                // KeyMisuse dominates
        emit Flagged(keyId, reason);
    }

    function _slash(Device storage d, bytes32 keyId, address beneficiary) internal {
        uint256 s = d.stake;
        d.stake = 0;
        uint256 reward = s * REWARD_BPS / 10_000;
        credit[beneficiary] += reward;
        if (s - reward > 0) _send(BURN, s - reward);
        emit Slashed(keyId, beneficiary, reward, s - reward);
    }

    function _send(address to, uint256 amt) internal {
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "send");
    }

    function _p256(bytes32 h, bytes calldata sig, bytes32 x, bytes32 y) internal view returns (bool) {
        if (sig.length != 64) return false;
        (bool ok, bytes memory ret) = P256.staticcall(abi.encodePacked(h, sig, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
