// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockOptimisticOracleV3.sol";

/// Paprika v2.4 = v2.3 plus assurance level 1: keys endorsed by a bonded issuer (N-Q). A proven misuse of a level-1
/// key pays the challenger a bounty from the issuer's bond, capped so that self-revocation always loses (D18).
/// Paprika v2.3 = v2.2 plus: I. low-s rule and keyId in every signed message (labels per spec/PROTOCOL.md);
///  J. objective proof of prior existence (escrowed exactly like a misuse proof); K. CLAIM_GRACE blocks after the last
///  claim settlement before withdraw; L. parameters of spec section 8.
/// Inherited from v2.2:
///  F. claims are commit-reveal; a misuse proof's reward waits REVEAL_WINDOW blocks, and any claim whose COMMIT
///     block is earlier than the proof's block has priority on the stake;
///  G. several open claims per device, each reserving one dispute bond from the free stake.
/// Stake priority rule (D13): every challenger has a priority p. Claim: p = commitBlock << 64 | revealSeq (seq >= 1).
/// Misuse proof: p = proofBlock << 64. The upheld claim or misuse proof with the lowest p receives REWARD_BPS of
/// the free stake, once no open claim with a lower p remains and (if a misuse proof exists) its window has passed.
/// No owner, no admin, no upgrade, no treasury.
contract PaprikaV2_4 is IOptimisticOracleV3CallbackRecipient {
    uint256 public constant MIN_STAKE = 0.25 ether;
    uint256 public constant REWARD_BPS = 5000;
    uint256 public constant UNBONDING_PERIOD = 30 days;
    uint256 public constant CLAIM_BOND = 0.11 ether;
    uint64 public constant CLAIM_GRACE = 100;                // blocks after the last claim settlement (K)
    uint256 public constant ISSUER_MIN_BOND = 1 ether;
    uint256 public constant ISSUER_BOUNTY = 0.1 ether;
    uint256 public constant ISSUER_UNBONDING = UNBONDING_PERIOD;
    uint256 private constant HALF_N_K1 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0; // secp256k1 n/2
    uint64 public constant LIVENESS = 2 hours;
    uint64 public constant REVEAL_WINDOW = 50;               // blocks
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    address private constant P256 = 0x0000000000000000000000000000000000000100;
    uint256 private constant NONE = type(uint256).max;
    uint256 private constant HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8; // floor(n/2), P-256

    enum Status { None, Active, Flagged, Retired }
    enum Reason { None, KeyMisuse, PriorExistence, ClaimUpheld }
    enum Verdict { None, UpheldFake }

    struct Device {
        address owner; Status status; Reason flagReason; uint32 openClaims; bool stakeSettled;
        uint64 flaggedAtBlock; uint64 unbondAt; uint64 withdrawnAtBlock; uint64 misuseBlock;  // misuseBlock = first objective proof
        uint64 lastClaimSettledBlock;
        uint256 stake;                 // free stake
        uint256 reserved;              // dispute bonds of open claims, held by the oracle
        address best; uint256 bestP;   // current stake beneficiary candidate and its priority
        bytes32 x; bytes32 y;
        uint8 level; address issuer; bool bestIsMisuse; bool issuerPending;   // level 1 (N-P)
    }
    struct Issuer {
        bool registered; uint64 exitAt; uint32 pending;   // pending = misuse proofs on its keys not yet settled
        uint32 keysEndorsed; uint32 keysFlaggedForMisuse;
        uint256 bond; uint256 deposited; uint256 bountiesPaid;
    }
    struct Record { uint64 anchorBlock; uint64 recordedBlock; Verdict verdict; bool claimOpen; }
    struct Claim { bytes32 photoHash; bytes32 keyId; address claimant; uint256 p; }
    struct Commit { uint64 blockNo; bool done; }

    IOptimisticOracleV3 public immutable oracle;
    mapping(bytes32 => Device) internal devices;   // read via devices(keyId) below (struct getter: stack limits)
    mapping(bytes32 => mapping(bytes32 => Record)) public records;
    mapping(bytes32 => Claim) public claims;                         // assertionId => claim
    mapping(bytes32 => bytes32[]) internal openIds;                  // keyId => open assertion ids
    mapping(address => mapping(bytes32 => Commit)) public commits;   // committer => commitment => commit
    mapping(address => uint256) public credit;
    mapping(address => Issuer) internal issuers;
    uint256 public commitBondsHeld;
    uint256 public inbox;
    uint64 private revealSeq;

    event Registered(bytes32 indexed keyId, address indexed owner, uint256 stake);
    event Attested(bytes32 indexed photoHash, bytes32 indexed keyId, uint64 anchorBlock, uint256 deposit);
    event Flagged(bytes32 indexed keyId, Reason reason);
    event IssuerBond(address indexed issuer, uint256 bond);
    event IssuerExit(address indexed issuer, uint64 exitAt);
    event Bounty(bytes32 indexed keyId, address indexed issuer, address indexed challenger, uint256 amount);
    event StakeAdded(bytes32 indexed keyId, uint256 amount);
    event PriorExistenceProven(bytes32 indexed photoHash, bytes32 indexed keyId, bytes32 indexed otherKeyId, address challenger);
    event Slashed(bytes32 indexed keyId, address indexed beneficiary, uint256 reward, uint256 burned);
    event Committed(address indexed committer, bytes32 commitment);
    event RevealRejected(address indexed claimant, bytes32 indexed photoHash, bytes32 indexed keyId);
    event CommitForfeited(address indexed committer, bytes32 commitment);
    event ClaimOpened(bytes32 indexed assertionId, bytes32 indexed photoHash, bytes32 indexed keyId, address claimant, bytes32 evidenceHash);
    event ClaimResolved(bytes32 indexed assertionId, bool upheld);
    event UnbondRequested(bytes32 indexed keyId, uint64 unbondAt);
    event Withdrawn(bytes32 indexed keyId, uint256 amount);

    constructor(IOptimisticOracleV3 _oracle) {
        // P: self-revocation of an endorsed key must lose: alpha*S + bounty < S
        require(ISSUER_BOUNTY < MIN_STAKE * (10_000 - REWARD_BPS) / 10_000, "bounty too high");
        oracle = _oracle;
    }

    // ---------------------------------------------------------------- issuers (N)
    function registerIssuer() external payable {
        Issuer storage i = issuers[msg.sender];
        require(msg.value >= ISSUER_MIN_BOND, "issuer bond");
        require(!i.registered, "issuer exists");
        // D19: re-registration after a full exit keeps the public counters (no laundering of a bad record)
        i.registered = true; i.exitAt = 0; i.bond = msg.value; i.deposited += msg.value;
        emit IssuerBond(msg.sender, i.bond);
    }

    function topUpIssuer() external payable {
        Issuer storage i = issuers[msg.sender];
        require(i.registered && i.exitAt == 0, "not active issuer");
        require(msg.value > 0, "value");
        i.bond += msg.value; i.deposited += msg.value;
        emit IssuerBond(msg.sender, i.bond);
    }

    function requestIssuerExit() external {
        Issuer storage i = issuers[msg.sender];
        require(i.registered && i.exitAt == 0, "not active issuer");
        i.exitAt = uint64(block.timestamp + ISSUER_UNBONDING);
        emit IssuerExit(msg.sender, i.exitAt);
    }

    function withdrawIssuerBond() external {
        Issuer storage i = issuers[msg.sender];
        require(i.registered && i.exitAt != 0, "not exiting");
        require(block.timestamp >= i.exitAt, "issuer unbonding");
        require(i.pending == 0, "bounties pending");                 // D20: escrowed bounties are paid first
        uint256 amt = i.bond;
        i.bond = 0; i.registered = false;
        if (amt > 0) _send(msg.sender, amt);
        emit IssuerBond(msg.sender, 0);
    }

    function issuerActive(address a) public view returns (bool) {
        Issuer storage i = issuers[a];
        return i.registered && i.exitAt == 0 && i.bond >= ISSUER_BOUNTY;
    }

    function issuer(address a) external view returns (Issuer memory) { return issuers[a]; }

    receive() external payable {
        require(msg.sender == address(oracle), "only oracle");
        inbox += msg.value;
    }

    // ---------------------------------------------------------------- registration / attestation (as v2.1)
    /// O: issuer == address(0) -> level 0 as in v2.3; otherwise an active issuer's secp256k1 endorsement of the KEY.
    function register(bytes32 x, bytes32 y, bytes calldata popSig, address issuerAddr, uint8 v, bytes32 r, bytes32 s)
        external payable returns (bytes32 keyId) {
        require(msg.value >= MIN_STAKE, "stake");
        keyId = sha256(abi.encodePacked(x, y));
        require(devices[keyId].status == Status.None, "key used");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA/REGISTER", block.chainid, address(this), keyId, msg.sender));
        require(_p256(m, popSig, x, y), "bad pop");
        Device storage d = devices[keyId];
        d.owner = msg.sender; d.status = Status.Active; d.stake = msg.value; d.bestP = NONE; d.x = x; d.y = y;
        if (issuerAddr != address(0)) {
            require(issuerActive(issuerAddr), "issuer inactive");
            require(uint256(s) <= HALF_N_K1 && (v == 27 || v == 28), "bad endorsement");
            bytes32 e = keccak256(abi.encodePacked("PAPRIKA/ENDORSE", block.chainid, address(this), keyId));
            address signer = ecrecover(e, v, r, s);
            require(signer != address(0) && signer == issuerAddr, "bad endorsement");
            d.level = 1; d.issuer = issuerAddr;
            issuers[issuerAddr].keysEndorsed++;
        }
        emit Registered(keyId, msg.sender, msg.value);
    }

    function attest(bytes32 photoHash, uint256 anchorBlock, bytes32 keyId, bytes calldata sig) external payable {
        Device storage d = devices[keyId];
        require(d.status == Status.Active, "not active");
        bytes32 bh = blockhash(anchorBlock);
        require(bh != 0, "anchor");
        Record storage r = records[photoHash][keyId];
        require(r.recordedBlock == 0, "exists");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA/CAPTURE", block.chainid, address(this), keyId, photoHash, bh));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        r.anchorBlock = uint64(anchorBlock);
        r.recordedBlock = uint64(block.number);
        if (msg.value > 0) { d.stake += msg.value; emit StakeAdded(keyId, msg.value); }
        emit Attested(photoHash, keyId, uint64(anchorBlock), msg.value);
    }

    // ---------------------------------------------------------------- objective challenge, reward escrowed (F)
    function proveKeyMisuse(bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status != Status.None, "unknown");
        require(d.flagReason != Reason.KeyMisuse, "already misuse");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA/EXTRACTED", block.chainid, address(this), keyId, msg.sender));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        _flag(d, keyId, Reason.KeyMisuse);
        uint256 before = d.bestP;
        _objectiveChallenger(d, msg.sender);
        if (d.bestP != before) d.bestIsMisuse = true;
        if (d.level == 1) {
            issuers[d.issuer].keysFlaggedForMisuse++;                // D21: counted at proof time (a public fact)
            if (!d.stakeSettled) { d.issuerPending = true; issuers[d.issuer].pending++; }
        }
    }

    /// J. Objective, from storage: another owner's key recorded the same digest before this record's anchor block.
    /// Escrowed exactly like a misuse proof (D16), so an accomplice's earlier record cannot pre-empt a committed claim.
    function provePriorExistence(bytes32 photoHash, bytes32 keyId, bytes32 otherKeyId) external {
        Record storage r = records[photoHash][keyId];
        Record storage o = records[photoHash][otherKeyId];
        require(r.recordedBlock != 0 && o.recordedBlock != 0, "no record");
        require(devices[keyId].owner != devices[otherKeyId].owner, "same owner");
        require(o.recordedBlock < r.anchorBlock, "not prior");
        require(r.verdict == Verdict.None, "has verdict");
        r.verdict = Verdict.UpheldFake;
        Device storage d = devices[keyId];
        _flag(d, keyId, Reason.PriorExistence);
        _objectiveChallenger(d, msg.sender);
        emit PriorExistenceProven(photoHash, keyId, otherKeyId, msg.sender);
    }

    function _objectiveChallenger(Device storage d, address challenger) internal {
        if (d.misuseBlock == 0) d.misuseBlock = uint64(block.number);   // the escrow window runs from the first proof
        uint256 p = uint256(block.number) << 64;
        if (p < d.bestP) { d.best = challenger; d.bestP = p; d.bestIsMisuse = false; }
    }

    /// Anyone: pay out the stake once the priority rule allows it (e.g. after a misuse proof's window).
    function settleStake(bytes32 keyId) external {
        require(_trySettle(devices[keyId], keyId), "not settleable");
    }

    // ---------------------------------------------------------------- subjective challenge: commit-reveal (F, G)
    function commitClaim(bytes32 commitment) external payable {
        require(msg.value == CLAIM_BOND, "bond");
        Commit storage k = commits[msg.sender][commitment];
        require(k.blockNo == 0, "committed");
        k.blockNo = uint64(block.number);
        commitBondsHeld += msg.value;
        emit Committed(msg.sender, commitment);
    }

    /// Returns 0 if the reveal is valid but rejected (bond credited back): no free stake for a bond, the record
    /// already has an open claim or a verdict, or the device's stake was already paid out.
    function revealClaim(bytes32 photoHash, bytes32 keyId, bytes32 evidenceHash, bytes32 salt) external returns (bytes32 id) {
        bytes32 cm = keccak256(abi.encode(msg.sender, photoHash, keyId, evidenceHash, salt));
        Commit storage k = commits[msg.sender][cm];
        require(k.blockNo != 0 && !k.done, "no commit");
        require(block.number > k.blockNo, "too early");
        require(block.number <= uint256(k.blockNo) + REVEAL_WINDOW, "too late");
        Record storage r = records[photoHash][keyId];
        require(r.recordedBlock != 0, "no record");
        k.done = true;
        commitBondsHeld -= CLAIM_BOND;
        Device storage d = devices[keyId];
        // D17 (found while testing v2.3): a verdict set by an objective proof made AFTER this commit must not
        // reject the reveal, otherwise an accomplice's prior-existence proof pre-empts a committed claim.
        bool verdictBlocks = r.verdict != Verdict.None && !(d.misuseBlock > k.blockNo && !d.stakeSettled);
        if (verdictBlocks || r.claimOpen || d.stakeSettled || d.stake < CLAIM_BOND) {
            credit[msg.sender] += CLAIM_BOND;
            emit RevealRejected(msg.sender, photoHash, keyId);
            return bytes32(0);
        }
        d.stake -= CLAIM_BOND;
        d.reserved += CLAIM_BOND;
        d.openClaims++;
        r.claimOpen = true;
        uint256 p = (uint256(k.blockNo) << 64) | uint256(++revealSeq);
        bytes memory text = abi.encodePacked("PAPRIKA-V2: the photo with sha256 ", photoHash, " attested by key ", keyId,
            " on ", address(this), " is not a genuine capture of that device; evidence sha256 ", evidenceHash);
        id = oracle.assertTruth{value: CLAIM_BOND}(text, msg.sender, address(this), address(0), LIVENESS, address(0),
            CLAIM_BOND, oracle.defaultIdentifier(), bytes32(0));
        claims[id] = Claim(photoHash, keyId, msg.sender, p);
        openIds[keyId].push(id);
        emit ClaimOpened(id, photoHash, keyId, msg.sender, evidenceHash);
        oracle.disputeAssertion{value: CLAIM_BOND}(id, address(this));
    }

    /// Anyone: burn the bond of a commit that was not revealed within REVEAL_WINDOW blocks.
    function forfeitCommit(address committer, bytes32 commitment) external {
        Commit storage k = commits[committer][commitment];
        require(k.blockNo != 0 && !k.done, "no commit");
        require(block.number > uint256(k.blockNo) + REVEAL_WINDOW, "window open");
        k.done = true;
        commitBondsHeld -= CLAIM_BOND;
        _send(BURN, CLAIM_BOND);
        emit CommitForfeited(committer, commitment);
    }

    /// Must never revert.
    function assertionResolvedCallback(bytes32 id, bool truthful) external {
        require(msg.sender == address(oracle), "only oracle");
        Claim memory c = claims[id];
        uint256 won = inbox;
        inbox = 0;
        if (c.claimant == address(0)) { if (won > 0) _send(BURN, won); return; }
        delete claims[id];
        _removeOpen(c.keyId, id);
        Record storage r = records[c.photoHash][c.keyId];
        Device storage d = devices[c.keyId];
        r.claimOpen = false;
        d.openClaims--;
        d.reserved -= CLAIM_BOND;
        d.lastClaimSettledBlock = uint64(block.number);                                  // K
        if (won > 0) { if (d.stakeSettled) _send(BURN, won); else { d.stake += won; emit StakeAdded(c.keyId, won); } }   // D14
        if (truthful) {
            r.verdict = Verdict.UpheldFake;
            _flag(d, c.keyId, Reason.ClaimUpheld);
            if (c.p < d.bestP) { d.best = c.claimant; d.bestP = c.p; d.bestIsMisuse = false; }
        }
        _trySettle(d, c.keyId);
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
        require(d.status == Status.Retired, "not retired");          // flagged (incl. escrowed misuse) never withdraws
        require(block.timestamp >= d.unbondAt, "unbonding");
        require(d.openClaims == 0, "open claims");
        require(d.lastClaimSettledBlock == 0 || block.number >= uint256(d.lastClaimSettledBlock) + CLAIM_GRACE, "claim grace");
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
        uint256 stakeAtRisk; uint64 withdrawnAtBlock; bool misusePending; uint32 openClaims;
        IssuerView iss;
    }
    struct IssuerView {
        uint8 level; address issuer; uint256 bond; uint32 keysEndorsed; uint32 keysFlaggedForMisuse; bool active; bool exiting;
    }
    function verify(bytes32 photoHash, bytes32 keyId) external view returns (View memory v) {
        Record memory r = records[photoHash][keyId];
        Device storage d = devices[keyId];
        v = View(r.anchorBlock, r.recordedBlock, r.verdict, d.status, d.flaggedAtBlock, d.flagReason, d.stake,
            r.recordedBlock != 0 && (d.status != Status.Flagged || r.recordedBlock < d.flaggedAtBlock),
            d.stakeSettled ? 0 : d.stake + d.reserved, d.withdrawnAtBlock,
            d.misuseBlock != 0 && !d.stakeSettled, d.openClaims, _issuerView(d));
    }

    function _issuerView(Device storage d) internal view returns (IssuerView memory w) {
        w.level = d.level; w.issuer = d.issuer;
        if (d.issuer != address(0)) {
            Issuer storage i = issuers[d.issuer];
            w.bond = i.bond; w.keysEndorsed = i.keysEndorsed; w.keysFlaggedForMisuse = i.keysFlaggedForMisuse;
            w.active = issuerActive(d.issuer); w.exiting = i.exitAt != 0;
        }
    }

    function device(bytes32 keyId) external view returns (Device memory) { return devices[keyId]; }

    function openClaimIds(bytes32 keyId) external view returns (bytes32[] memory) { return openIds[keyId]; }

    // ---------------------------------------------------------------- internals
    function _flag(Device storage d, bytes32 keyId, Reason reason) internal {
        if (d.status != Status.Flagged) d.flaggedAtBlock = uint64(block.number);
        d.status = Status.Flagged;
        if (d.flagReason == Reason.None || reason == Reason.KeyMisuse) d.flagReason = reason;   // first reason, KeyMisuse overrides
        emit Flagged(keyId, reason);
    }

    function _trySettle(Device storage d, bytes32 keyId) internal returns (bool) {
        if (d.stakeSettled || d.best == address(0)) return false;
        if (d.misuseBlock != 0 && block.number <= uint256(d.misuseBlock) + REVEAL_WINDOW) return false;
        bytes32[] storage ids = openIds[keyId];
        for (uint256 i = 0; i < ids.length; i++) if (claims[ids[i]].p < d.bestP) return false;  // D15: bounded by stake/bond
        d.stakeSettled = true;
        uint256 s = d.stake;
        d.stake = 0;
        uint256 reward = s * REWARD_BPS / 10_000;
        credit[d.best] += reward;
        if (s - reward > 0) _send(BURN, s - reward);
        emit Slashed(keyId, d.best, reward, s - reward);
        if (d.issuerPending) {
            d.issuerPending = false;
            Issuer storage iss = issuers[d.issuer];
            iss.pending--;
            if (d.bestIsMisuse) {
                // P / D18: bounty = min(ISSUER_BOUNTY, issuer bond, burned part of this device's stake)
                uint256 b = ISSUER_BOUNTY;
                if (b > iss.bond) b = iss.bond;
                if (b > s - reward) b = s - reward;
                if (b > 0) { iss.bond -= b; iss.bountiesPaid += b; credit[d.best] += b; emit Bounty(keyId, d.issuer, d.best, b); }
            }
        }
        return true;
    }

    function _removeOpen(bytes32 keyId, bytes32 id) internal {
        bytes32[] storage ids = openIds[keyId];
        for (uint256 i = 0; i < ids.length; i++) if (ids[i] == id) { ids[i] = ids[ids.length - 1]; ids.pop(); return; }
    }

    function _send(address to, uint256 amt) internal {
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "send");
    }

    /// The digest h is always computed by the caller inside this contract from fields; never caller-supplied.
    function _p256(bytes32 h, bytes calldata sig, bytes32 x, bytes32 y) internal view returns (bool) {
        if (sig.length != 64) return false;
        if (uint256(bytes32(sig[32:64])) > HALF_N) return false;                       // I: low-s only
        (bool ok, bytes memory ret) = P256.staticcall(abi.encodePacked(h, sig, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
