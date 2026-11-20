// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Subset of UMA's OptimisticOracleV3Interface used by Paprika (names and arguments as in UMA).
/// Deviation: `assertTruth` and `disputeAssertion` are payable because the mock takes the bond in native ETH
/// (currency = address(0)); the real OOv3 pulls a whitelisted ERC-20 bond with transferFrom.
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
    ) external payable returns (bytes32);
    function disputeAssertion(bytes32 assertionId, address disputer) external payable;
    function settleAssertion(bytes32 assertionId) external;
    function defaultIdentifier() external view returns (bytes32);
}

/// Callbacks exactly as in UMA's OptimisticOracleV3CallbackRecipientInterface.
interface IOptimisticOracleV3CallbackRecipient {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
    function assertionDisputedCallback(bytes32 assertionId) external;
}

/// Paprika: a device key (P-256) registers with a stake and attests photo hashes; anyone can challenge it.
/// - Proof of key misuse: a signature by the key over the prover's address flags the key; the reward waits
///   REVEAL_WINDOW blocks (escrow).
/// - Claim: commit, then reveal; the contract asserts the claim at the oracle and disputes it itself with the
///   device's stake, so every claim goes to the vote. Each open claim reserves one CLAIM_BOND of free stake.
/// - Stake priority: claim p = commitBlock << 64 | revealSeq; misuse proof p = proofBlock << 64. The upheld claim
///   or misuse proof with the lowest p receives REWARD_BPS of the free stake (the rest is burned), once no open
///   claim with a lower p remains and the misuse proof's window (if any) has passed.
/// - Payouts are credited and collected with claimCredit; no settlement depends on a transfer to an arbitrary address.
/// No owner, no admin, no upgrade, no treasury.
contract Paprika is IOptimisticOracleV3CallbackRecipient {
    uint256 public constant MIN_STAKE = 0.25 ether;
    uint256 public constant REWARD_BPS = 5000;
    uint256 public constant UNBONDING_PERIOD = 30 days;
    uint256 public constant CLAIM_BOND = 0.11 ether;
    uint64 public constant CLAIM_GRACE = 100;                // blocks after the last claim settlement before withdraw
    uint64 public constant LIVENESS = 2 hours;
    uint64 public constant REVEAL_WINDOW = 50;               // blocks
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    address private constant P256 = 0x0000000000000000000000000000000000000100;
    uint256 private constant NONE = type(uint256).max;
    uint256 private constant HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8; // floor(n/2), P-256

    enum Status { None, Active, Flagged, Retired }
    enum Reason { None, KeyMisuse, ClaimUpheld }
    enum Verdict { None, UpheldFake }

    struct Device {
        address owner; Status status; Reason flagReason; uint32 openClaims; bool stakeSettled;
        uint64 flaggedAtBlock; uint64 unbondAt; uint64 withdrawnAtBlock; uint64 misuseBlock;  // misuseBlock = first misuse proof
        uint64 lastClaimSettledBlock;
        uint256 stake;                 // free stake
        uint256 reserved;              // dispute bonds of open claims, held by the oracle
        address best; uint256 bestP;   // current stake beneficiary candidate and its priority
        bytes32 x; bytes32 y;
    }
    struct Record { uint64 anchorBlock; uint64 recordedBlock; Verdict verdict; bool claimOpen; }
    struct Claim { bytes32 photoHash; bytes32 keyId; address claimant; uint256 p; }
    struct Commit { uint64 blockNo; bool done; }

    IOptimisticOracleV3 public immutable oracle;
    mapping(bytes32 => Device) internal devices;   // read via device(keyId) below (struct getter: stack limits)
    mapping(bytes32 => mapping(bytes32 => Record)) public records;
    mapping(bytes32 => Claim) public claims;                         // assertionId => claim
    mapping(bytes32 => bytes32[]) internal openIds;                  // keyId => open assertion ids
    mapping(address => mapping(bytes32 => Commit)) public commits;   // committer => commitment => commit
    mapping(address => uint256) public credit;
    uint256 public commitBondsHeld;
    uint256 public inbox;
    uint64 private revealSeq;

    event Registered(bytes32 indexed keyId, address indexed owner, uint256 stake);
    event Attested(bytes32 indexed photoHash, bytes32 indexed keyId, uint64 anchorBlock, uint256 deposit);
    event Flagged(bytes32 indexed keyId, Reason reason, bool firstFlag, address indexed by);  // every flag decision
    event StakeAdded(bytes32 indexed keyId, uint256 amount);
    event Slashed(bytes32 indexed keyId, address indexed beneficiary, uint256 reward, uint256 burned);
    event Committed(address indexed committer, bytes32 commitment);
    event RevealRejected(address indexed claimant, bytes32 indexed photoHash, bytes32 indexed keyId);
    event CommitForfeited(address indexed committer, bytes32 commitment);
    event ClaimOpened(bytes32 indexed assertionId, bytes32 indexed photoHash, bytes32 indexed keyId, address claimant, bytes32 evidenceHash);
    event ClaimResolved(bytes32 indexed assertionId, bool upheld);
    event UnbondRequested(bytes32 indexed keyId, uint64 unbondAt);
    event Withdrawn(bytes32 indexed keyId, uint256 amount);

    constructor(IOptimisticOracleV3 _oracle) {
        oracle = _oracle;
    }

    /// Accepts ETH only from the oracle (dispute payouts); credited per claim in the resolution callback.
    receive() external payable {
        require(msg.sender == address(oracle), "only oracle");
        inbox += msg.value;
    }

    // ---------------------------------------------------------------- registration / attestation
    /// Registers a P-256 key with a stake. popSig = the key's signature over REGISTER, bound to msg.sender.
    function register(bytes32 x, bytes32 y, bytes calldata popSig) external payable returns (bytes32 keyId) {
        require(msg.value >= MIN_STAKE, "stake");
        keyId = sha256(abi.encodePacked(x, y));
        require(devices[keyId].status == Status.None, "key used");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA/REGISTER", block.chainid, address(this), keyId, msg.sender));
        require(_p256(m, popSig, x, y), "bad pop");
        Device storage d = devices[keyId];
        d.owner = msg.sender; d.status = Status.Active; d.stake = msg.value; d.bestP = NONE; d.x = x; d.y = y;
        emit Registered(keyId, msg.sender, msg.value);
    }

    /// Records a photo hash signed by an active key (anyone may relay); the signed message names a recent block
    /// hash (anchor). Any ETH sent is added to the device's stake.
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

    // ---------------------------------------------------------------- objective challenge, reward escrowed
    /// Proof of key misuse: the key's signature over EXTRACTED naming msg.sender. Flags the key; the reward waits.
    function proveKeyMisuse(bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status != Status.None, "unknown");
        require(d.flagReason != Reason.KeyMisuse, "already misuse");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA/EXTRACTED", block.chainid, address(this), keyId, msg.sender));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        _flag(d, keyId, Reason.KeyMisuse);
        _objectiveChallenger(d, msg.sender);
    }

    function _objectiveChallenger(Device storage d, address challenger) internal {
        if (d.misuseBlock == 0) d.misuseBlock = uint64(block.number);   // the escrow window runs from the misuse proof
        uint256 p = uint256(block.number) << 64;
        if (p < d.bestP) { d.best = challenger; d.bestP = p; }
    }

    /// Anyone: pay out the stake once the priority rule allows it (e.g. after a misuse proof's window).
    function settleStake(bytes32 keyId) external {
        require(_trySettle(devices[keyId], keyId), "not settleable");
    }

    // ---------------------------------------------------------------- subjective challenge: commit-reveal
    /// Step 1 of a claim: commit keccak256(abi.encode(claimant, photoHash, keyId, evidenceHash, salt)) with CLAIM_BOND.
    function commitClaim(bytes32 commitment) external payable {
        require(msg.value == CLAIM_BOND, "bond");
        Commit storage k = commits[msg.sender][commitment];
        require(k.blockNo == 0, "committed");
        k.blockNo = uint64(block.number);
        commitBondsHeld += msg.value;
        emit Committed(msg.sender, commitment);
    }

    /// Step 2: reveal within REVEAL_WINDOW blocks; opens the claim at the oracle and disputes it with the device's stake.
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
        if (r.verdict != Verdict.None || r.claimOpen || d.stakeSettled || d.stake < CLAIM_BOND) {
            credit[msg.sender] += CLAIM_BOND;
            emit RevealRejected(msg.sender, photoHash, keyId);
            return bytes32(0);
        }
        d.stake -= CLAIM_BOND;
        d.reserved += CLAIM_BOND;
        d.openClaims++;
        r.claimOpen = true;
        uint256 p = (uint256(k.blockNo) << 64) | uint256(++revealSeq);
        bytes memory text = abi.encodePacked("PAPRIKA: the photo with sha256 ", photoHash, " attested by key ", keyId,
            " on ", address(this), " is not a genuine capture of that device; evidence sha256 ", evidenceHash);
        // the contract is the asserter, so every oracle payout lands here and is credited internally
        id = oracle.assertTruth{value: CLAIM_BOND}(text, address(this), address(this), address(0), LIVENESS, address(0),
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

    /// Oracle: the vote's result. Upheld: claimant credited, record judged, key flagged. Rejected: winnings to the
    /// device's stake. Must never revert.
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
        d.lastClaimSettledBlock = uint64(block.number);
        if (truthful) credit[c.claimant] += won;                 // claimant's bond + winnings, collected by pull
        else if (won > 0) { if (d.stakeSettled) _send(BURN, won); else { d.stake += won; emit StakeAdded(c.keyId, won); } }
        if (truthful) {
            r.verdict = Verdict.UpheldFake;
            _flag(d, c.keyId, Reason.ClaimUpheld);
            if (c.p < d.bestP) { d.best = c.claimant; d.bestP = c.p; }
        }
        _trySettle(d, c.keyId);
        emit ClaimResolved(id, truthful);
    }

    /// Oracle: dispute notice (the contract disputes its own assertions; nothing to do).
    function assertionDisputedCallback(bytes32) external view {
        require(msg.sender == address(oracle), "only oracle");
    }

    // ---------------------------------------------------------------- exit
    /// Owner: retire an active key; no new records; the stake can be withdrawn after UNBONDING_PERIOD.
    function requestUnbond(bytes32 keyId) external {
        Device storage d = devices[keyId];
        require(msg.sender == d.owner, "not owner");
        require(d.status == Status.Active, "not active");
        d.status = Status.Retired;
        d.unbondAt = uint64(block.timestamp + UNBONDING_PERIOD);
        emit UnbondRequested(keyId, d.unbondAt);
    }

    /// Owner: take the free stake back after unbonding, with no open claim and CLAIM_GRACE blocks after the last one.
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

    /// Collect credited payouts (rewards, oracle winnings, refunded bonds).
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
        uint256 reservedForClaims;   // locked in the oracle for open claims; NOT winnable by a new challenger
    }
    /// What a verifier needs about one record and its key.
    function verify(bytes32 photoHash, bytes32 keyId) external view returns (View memory v) {
        Record memory r = records[photoHash][keyId];
        Device storage d = devices[keyId];
        v = View(r.anchorBlock, r.recordedBlock, r.verdict, d.status, d.flaggedAtBlock, d.flagReason, d.stake,
            r.recordedBlock != 0 && (d.status != Status.Flagged || r.recordedBlock < d.flaggedAtBlock),
            d.stakeSettled ? 0 : d.stake, d.withdrawnAtBlock,                  // stakeAtRisk = free stake only
            d.misuseBlock != 0 && !d.stakeSettled, d.openClaims, d.reserved);
    }

    function device(bytes32 keyId) external view returns (Device memory) { return devices[keyId]; }

    function openClaimIds(bytes32 keyId) external view returns (bytes32[] memory) { return openIds[keyId]; }

    // ---------------------------------------------------------------- internals
    function _flag(Device storage d, bytes32 keyId, Reason reason) internal {
        emit Flagged(keyId, reason, d.status != Status.Flagged, msg.sender);
        if (d.status != Status.Flagged) d.flaggedAtBlock = uint64(block.number);
        d.status = Status.Flagged;
        if (d.flagReason == Reason.None || reason == Reason.KeyMisuse) d.flagReason = reason;   // first reason, KeyMisuse overrides
    }

    function _trySettle(Device storage d, bytes32 keyId) internal returns (bool) {
        if (d.stakeSettled || d.best == address(0)) return false;
        if (d.misuseBlock != 0 && block.number <= uint256(d.misuseBlock) + REVEAL_WINDOW) return false;
        bytes32[] storage ids = openIds[keyId];
        for (uint256 i = 0; i < ids.length; i++) if (claims[ids[i]].p < d.bestP) return false;  // bounded by stake/bond
        d.stakeSettled = true;
        uint256 s = d.stake;
        d.stake = 0;
        uint256 reward = s * REWARD_BPS / 10_000;
        credit[d.best] += reward;
        if (s - reward > 0) _send(BURN, s - reward);
        emit Slashed(keyId, d.best, reward, s - reward);
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
        if (uint256(bytes32(sig[32:64])) > HALF_N) return false;                       // low-s only
        (bool ok, bytes memory ret) = P256.staticcall(abi.encodePacked(h, sig, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
