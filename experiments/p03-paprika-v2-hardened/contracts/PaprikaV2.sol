// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockOptimisticOracleV3.sol";

/// Paprika v2 (hardened). No owner, no admin, no upgrade, no treasury. Device keys are P-256, verified with the
/// precompile at 0x100 (EIP-7951, hardfork osaka). Choices not fixed by the brief are marked D# and explained
/// in README.md ("Design notes and deviations").
contract PaprikaV2 is IOptimisticOracleV3CallbackRecipient {
    uint256 public constant MIN_STAKE = 0.1 ether;
    uint256 public constant REWARD_BPS = 5000;              // 50% of the slashed stake to the challenger
    uint256 public constant UNBONDING_PERIOD = 7 days;
    uint256 public constant CLAIM_BOND = 0.05 ether;
    uint64 public constant LIVENESS = 2 hours;               // UMA's default liveness
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    address private constant P256 = 0x0000000000000000000000000000000000000100;

    enum Status { None, Active, Flagged, Retired }
    enum Reason { None, KeyMisuse, DisputeUpheld }
    enum Verdict { None, UpheldFake }

    struct Device {
        address owner; Status status; Reason flagReason; uint32 openClaims;
        uint64 flaggedAtBlock; uint64 unbondAt;
        uint256 stake;
        bytes32 x; bytes32 y;
    }
    struct Record { uint64 anchorBlock; uint64 recordedBlock; Verdict verdict; bool claimOpen; }
    struct Claim { bytes32 photoHash; bytes32 keyId; address claimant; }

    IOptimisticOracleV3 public immutable oracle;            // fixed at deployment (no admin can change it)
    mapping(bytes32 => Device) public devices;
    mapping(bytes32 => mapping(bytes32 => Record)) public records;   // photoHash => keyId => record
    mapping(bytes32 => bytes32) public firstKeyOf;                   // photoHash => first keyId that attested it
    mapping(bytes32 => Claim) public claims;                         // assertionId => claim
    mapping(address => uint256) public credit;                       // D3: pull payments for rewards

    event Registered(bytes32 indexed keyId, address indexed owner, uint256 stake);
    event Attested(bytes32 indexed photoHash, bytes32 indexed keyId, uint64 anchorBlock, uint256 deposit);
    event Flagged(bytes32 indexed keyId, Reason reason, address indexed challenger, uint256 reward, uint256 burned);
    event ClaimOpened(bytes32 indexed assertionId, bytes32 indexed photoHash, bytes32 indexed keyId, address claimant, bytes32 evidenceHash);
    event ClaimResolved(bytes32 indexed assertionId, bool upheld);
    event UnbondRequested(bytes32 indexed keyId, uint64 unbondAt);
    event Withdrawn(bytes32 indexed keyId, uint256 amount);

    constructor(IOptimisticOracleV3 _oracle) { oracle = _oracle; }

    // ---------------------------------------------------------------- registration
    function register(bytes32 x, bytes32 y, bytes calldata popSig) external payable returns (bytes32 keyId) {
        require(msg.value >= MIN_STAKE, "stake");
        keyId = sha256(abi.encodePacked(x, y));
        require(devices[keyId].status == Status.None, "key used");          // never re-registrable
        bytes32 m = sha256(abi.encodePacked("PAPRIKA-V2/REGISTER", block.chainid, address(this), msg.sender));
        require(_p256(m, popSig, x, y), "bad pop");
        devices[keyId] = Device(msg.sender, Status.Active, Reason.None, 0, 0, 0, msg.value, x, y);
        emit Registered(keyId, msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- attestation (any relayer may send)
    function attest(bytes32 photoHash, uint256 anchorBlock, bytes32 keyId, bytes calldata sig) external payable {
        Device storage d = devices[keyId];
        require(d.status == Status.Active, "not active");
        bytes32 bh = blockhash(anchorBlock);
        require(bh != 0, "anchor");                                          // one of the last 256 blocks
        Record storage r = records[photoHash][keyId];
        require(r.recordedBlock == 0, "exists");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA-V2/CAPTURE", block.chainid, address(this), photoHash, bh));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        r.anchorBlock = uint64(anchorBlock);
        r.recordedBlock = uint64(block.number);
        if (firstKeyOf[photoHash] == 0) firstKeyOf[photoHash] = keyId;
        if (msg.value > 0) d.stake += msg.value;                             // per-photo deposit, at risk
        emit Attested(photoHash, keyId, uint64(anchorBlock), msg.value);
    }

    // ---------------------------------------------------------------- objective challenge
    function proveKeyMisuse(bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status != Status.None, "unknown");
        require(!(d.status == Status.Flagged && d.flagReason == Reason.KeyMisuse), "already misuse");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA-V2/EXTRACTED", block.chainid, address(this), msg.sender));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        _flagAndSlash(d, keyId, Reason.KeyMisuse, msg.sender);
    }

    // ---------------------------------------------------------------- subjective challenge (optimistic oracle)
    function claimFake(bytes32 photoHash, bytes32 keyId, bytes32 evidenceHash) external payable returns (bytes32 id) {
        Record storage r = records[photoHash][keyId];
        require(r.recordedBlock != 0, "no record");
        require(r.verdict == Verdict.None, "has verdict");
        require(!r.claimOpen, "claim open");
        require(msg.value == CLAIM_BOND, "bond");
        r.claimOpen = true;
        devices[keyId].openClaims++;
        // D7: compact machine claim; a real deployment would render it as UTF-8 text for UMA voters.
        bytes memory text = abi.encodePacked("PAPRIKA-V2: the photo with sha256 ", photoHash, " attested by key ", keyId,
            " on ", address(this), " is not a genuine capture of that device; evidence sha256 ", evidenceHash);
        // asserter = claimant: the oracle returns the bond (or both bonds) to the claimant directly.
        id = oracle.assertTruth{value: msg.value}(text, msg.sender, address(this), address(0), LIVENESS, address(0),
            CLAIM_BOND, oracle.defaultIdentifier(), bytes32(0));
        claims[id] = Claim(photoHash, keyId, msg.sender);
        emit ClaimOpened(id, photoHash, keyId, msg.sender, evidenceHash);
    }

    /// D3: must never revert, otherwise UMA settlement (and the bonds) would be stuck.
    function assertionResolvedCallback(bytes32 id, bool truthful) external {
        require(msg.sender == address(oracle), "only oracle");
        Claim memory c = claims[id];
        if (c.claimant == address(0)) return;
        delete claims[id];
        Record storage r = records[c.photoHash][c.keyId];
        Device storage d = devices[c.keyId];
        r.claimOpen = false;
        d.openClaims--;
        if (truthful) {
            r.verdict = Verdict.UpheldFake;
            _flagAndSlash(d, c.keyId, Reason.DisputeUpheld, c.claimant);
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
    }
    /// D5: recordedBeforeFlag = record exists and (device not flagged, or recordedBlock < flaggedAtBlock).
    function verify(bytes32 photoHash, bytes32 keyId) external view returns (View memory v) {
        Record memory r = records[photoHash][keyId];
        Device memory d = devices[keyId];
        v = View(r.anchorBlock, r.recordedBlock, r.verdict, d.status, d.flaggedAtBlock, d.flagReason, d.stake,
            r.recordedBlock != 0 && (d.status != Status.Flagged || r.recordedBlock < d.flaggedAtBlock));
    }

    // ---------------------------------------------------------------- internals
    function _flagAndSlash(Device storage d, bytes32 keyId, Reason reason, address challenger) internal {
        if (d.status != Status.Flagged) d.flaggedAtBlock = uint64(block.number);   // D4: earliest flag kept
        d.status = Status.Flagged;
        if (d.flagReason != Reason.KeyMisuse) d.flagReason = reason;                // KeyMisuse dominates
        uint256 s = d.stake;
        d.stake = 0;
        uint256 reward = s * REWARD_BPS / 10_000;
        credit[challenger] += reward;
        if (s - reward > 0) _send(BURN, s - reward);
        emit Flagged(keyId, reason, challenger, reward, s - reward);
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
