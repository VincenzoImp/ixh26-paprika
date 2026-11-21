// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// The part of UMA's Optimistic Oracle V3 that Paprika uses (signatures as in UMA).
interface IOptimisticOracleV3 {
    function assertTruth(bytes memory claim, address asserter, address callbackRecipient, address escalationManager,
        uint64 liveness, IERC20 currency, uint256 bond, bytes32 identifier, bytes32 domainId) external returns (bytes32 assertionId);
    function disputeAssertion(bytes32 assertionId, address disputer) external;
    function settleAssertion(bytes32 assertionId) external;
    function getMinimumBond(address currency) external view returns (uint256);
    function defaultIdentifier() external view returns (bytes32);
    function burnedBondPercentage() external view returns (uint256);
}

/// UMA's callback interface for assertion recipients.
interface IOptimisticOracleV3CallbackRecipient {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
    function assertionDisputedCallback(bytes32 assertionId) external;
}

/// @title Paprika: photos signed by a device key, backed by a deposit, judged by UMA if accused.
/// How it works, in order:
/// 1. A device (phone secure element) has a P-256 key. Anyone registers it for free with register(x, y, popSig);
///    popSig proves the key is held and names the caller. keyId = sha256(x || y). A key registers once, ever.
/// 2. The device signs (photo sha256, a recent block hash). Anyone submits it with attest(); the sender pays a
///    deposit of BOND tokens (approved beforehand) and becomes the depositor. The record bounds when the photo was
///    SIGNED: after block anchorBlock, no later than block recordedBlock (not when it was taken or first existed).
///    One record per (photo, key); attestersOf(photoHash) lists the keys.
/// 3. Verification from a file alone: hash it, call attestersOf(hash), then verify(hash, keyId) for each key.
/// 4. Accusing: until accusableUntil (attest time + PHOTO_WINDOW), anyone commits a hidden accusation with BOND
///    (commitClaim), then reveals it 1 block to REVEAL_WINDOW later (revealClaim). Paprika asserts "this photo is
///    not genuine" at UMA's Optimistic Oracle V3 with the accuser's bond and disputes it at once with the photo's
///    deposit, so UMA's token-holder vote always decides. One accusation per photo at a time: a valid reveal that
///    arrives while another accusation is open (or after the photo is proven fake) gets its bond back as credit.
/// 5. UMA settles and pays Paprika 2 x BOND - fee (fee = burnedBondPercentage x BOND goes to UMA's Store).
///    Fake proven: the accuser gets it all, the device is flagged. Rejected: the deposit is restored, the depositor
///    gets the rest, and the window is extended by the time the photo spent under accusation.
/// 6. Nobody proves it fake: after accusableUntil + REVEAL_WINDOW anyone calls refund(); the depositor gets BOND back.
/// Parameters (fixed at deployment): oo, currency, BOND, PHOTO_WINDOW, REVEAL_WINDOW, LIVENESS.
/// All payouts are credits collected with withdrawCredit(). No owner, no admin, no upgrade, no ETH. Nothing is deleted.
contract Paprika is IOptimisticOracleV3CallbackRecipient {
    /// Device status: Flagged devices can no longer attest (their existing records are untouched).
    enum Status { None, Active, Flagged }
    /// Why a device was flagged: a fake proven by UMA, or a revocation signed with the key.
    enum Reason { None, FakeProven, KeyRevoked }
    /// Record life: Attested -> Accused -> (Attested | Fake), or Attested -> Refunded. Fake and Refunded are final.
    enum State { None, Attested, Accused, Refunded, Fake }

    /// A registered key. owner = who registered it (information only, grants no right). (x, y) = the public key.
    struct Device { address owner; Status status; Reason reason; uint64 flaggedAtBlock; bytes32 x; bytes32 y; }
    /// One attested photo for one key. accusableUntil = last second a commitment may be made against it.
    struct Record { address depositor; uint64 anchorBlock; uint64 recordedBlock; uint64 accusableUntil; State state; }
    /// A hidden accusation and its bond; live = bond still held here (not yet revealed or forfeited).
    struct Commit { address claimant; uint64 committedAt; uint64 committedBlock; bool live; }
    /// An accusation sent to UMA, keyed by UMA's assertionId; open until UMA settles it.
    struct Accusation { bytes32 photoHash; bytes32 keyId; address claimant; uint64 openedAt; bool open; }
    /// What verify() returns. lockedDeposit = BOND while Attested or Accused (held by UMA while Accused), else 0.
    struct View {
        State state; uint64 anchorBlock; uint64 recordedBlock; uint64 accusableUntil; uint256 refundableAt;
        address depositor; uint256 lockedDeposit; Status deviceStatus; uint64 flaggedAtBlock; Reason reason;
        bool recordedBeforeFlag;
    }

    // ------------------------------------------------------------------ constants and parameters
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;   // forfeited commit bonds
    address private constant P256 = address(0x100);                                // P-256 verify precompile
    /// Half the P-256 group order: signatures must have s <= HALF_N, so each signature has a single valid form.
    uint256 private constant HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8;

    IOptimisticOracleV3 public immutable oo;   // UMA's Optimistic Oracle V3
    IERC20 public immutable currency;          // bond token (must be whitelisted at UMA)
    bytes32 public immutable identifier;       // UMA's defaultIdentifier(), read at deployment
    uint256 public immutable BOND;            // photo deposit = accusation bond (UMA needs equal bonds)
    uint256 public immutable PHOTO_WINDOW;    // seconds during which a photo can be accused (extended while accused)
    uint256 public immutable REVEAL_WINDOW;   // seconds between commit and reveal
    uint64 public immutable LIVENESS;         // passed to UMA; every accusation is disputed at once

    // ------------------------------------------------------------------ state (all public, nothing is ever deleted)
    mapping(bytes32 => Device) public devices;                       // keyId => device
    mapping(bytes32 => mapping(bytes32 => Record)) public records;   // photoHash => keyId => record
    mapping(bytes32 => Commit) public commits;                       // commitment => commit
    mapping(bytes32 => Accusation) public accusations;               // UMA assertionId => accusation
    mapping(address => uint256) public credits;
    mapping(bytes32 => bytes32[]) internal keysOf;                   // photoHash => keyIds that attested it, in order

    // ------------------------------------------------------------------ events: one per state change
    event Registered(bytes32 indexed keyId, address indexed owner);
    event Attested(bytes32 indexed photoHash, bytes32 indexed keyId, address indexed depositor, uint256 anchorBlock);
    event Refunded(bytes32 indexed photoHash, bytes32 indexed keyId, address indexed depositor);
    event Committed(bytes32 indexed commitment, address indexed claimant);
    event AccusationOpened(bytes32 indexed assertionId, bytes32 indexed photoHash, bytes32 indexed keyId, address claimant, bytes32 evidenceHash);
    event BondReturned(bytes32 indexed commitment, address indexed claimant);   // reveal on a photo already proven fake
    event CommitForfeited(bytes32 indexed commitment);
    event AccusationResolved(bytes32 indexed assertionId, bool fakeProven, uint64 accusableUntil);
    event DeviceFlagged(bytes32 indexed keyId, Reason reason);
    event Credited(address indexed account, uint256 amount);
    event CreditWithdrawn(address indexed account, uint256 amount);

    /// UMA's callbacks must come from the oracle itself.
    modifier onlyOO() {
        require(msg.sender == address(oo), "only oracle");
        _;
    }

    /// Checks: BOND > 0 and at least UMA's minimum bond for this token (else UMA would refuse every accusation);
    /// non-zero windows and liveness. Reads UMA's default identifier once.
    constructor(IOptimisticOracleV3 oo_, IERC20 currency_, uint256 bond, uint256 photoWindow, uint256 revealWindow, uint64 liveness) {
        require(bond > 0 && bond >= oo_.getMinimumBond(address(currency_)) && photoWindow > 0 && revealWindow > 0
            && liveness > 0, "bad params");
        (oo, currency, identifier, BOND) = (oo_, currency_, oo_.defaultIdentifier(), bond);
        (PHOTO_WINDOW, REVEAL_WINDOW, LIVENESS) = (photoWindow, revealWindow, liveness);
    }

    /// Anyone, free. Checks: the key was never registered; popSig is the key's signature over
    /// sha256("PAPRIKA/REGISTER" || chainid || this contract || keyId || msg.sender). Naming msg.sender means a copy of
    /// this transaction sent from another address fails. Sets the device Active.
    function register(bytes32 x, bytes32 y, bytes calldata popSig) external returns (bytes32 keyId) {
        keyId = sha256(abi.encodePacked(x, y));
        Device storage d = devices[keyId];
        require(d.status == Status.None, "key used");
        require(_p256(_namedDigest("PAPRIKA/REGISTER", keyId), popSig, x, y), "bad sig");
        (d.owner, d.status, d.x, d.y) = (msg.sender, Status.Active, x, y);
        emit Registered(keyId, msg.sender);
    }

    /// Anyone (often a relayer). Checks: the device is Active; anchorBlock is one of the last 256 blocks; no record
    /// yet for (photo, key); sig is the key's signature over sha256("PAPRIKA/CAPTURE" || chainid || this contract ||
    /// keyId || photoHash || blockhash(anchorBlock)). Creates the record and pulls BOND from the sender (the depositor).
    function attest(bytes32 photoHash, uint256 anchorBlock, bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status == Status.Active, "not active");
        // The signed block hash proves the photo was signed after that block (it could not be predicted earlier);
        // blockhash is 0 for future blocks and for blocks older than 256, so stale or invented anchors fail.
        bytes32 bh = blockhash(anchorBlock);
        require(bh != 0, "anchor");
        Record storage r = records[photoHash][keyId];
        require(r.state == State.None, "exists");
        bytes32 m = sha256(abi.encodePacked("PAPRIKA/CAPTURE", block.chainid, address(this), keyId, photoHash, bh));
        require(_p256(m, sig, d.x, d.y), "bad sig");
        (r.depositor, r.anchorBlock, r.recordedBlock) = (msg.sender, uint64(anchorBlock), uint64(block.number));
        (r.accusableUntil, r.state) = (uint64(block.timestamp + PHOTO_WINDOW), State.Attested);
        keysOf[photoHash].push(keyId);
        emit Attested(photoHash, keyId, msg.sender, anchorBlock);
        _pull(msg.sender, BOND);
    }

    /// Anyone. Checks: the record is Attested (not under accusation) and the last commitment allowed
    /// (at accusableUntil) can no longer be revealed. Credits BOND to the depositor; the record becomes Refunded.
    function refund(bytes32 photoHash, bytes32 keyId) external {
        Record storage r = records[photoHash][keyId];
        require(r.state == State.Attested, "not attested");
        // strictly after the last possible reveal, so a refund can never get in ahead of a valid accusation
        require(block.timestamp > r.accusableUntil + REVEAL_WINDOW, "too early");
        r.state = State.Refunded;
        _credit(r.depositor, BOND);
        emit Refunded(photoHash, keyId, r.depositor);
    }

    /// Anyone. Step 1 of an accusation: commitment = keccak256(abi.encode(claimant, photoHash, keyId, evidenceHash, salt)).
    /// Hiding the target first stops others from copying the accusation from the mempool. Pulls BOND from the sender.
    /// A commitment value can be used once, ever.
    function commitClaim(bytes32 commitment) external {
        Commit storage k = commits[commitment];
        require(k.claimant == address(0), "commitment used");
        (k.claimant, k.committedAt, k.committedBlock, k.live) = (msg.sender, uint64(block.timestamp), uint64(block.number), true);
        emit Committed(commitment, msg.sender);
        _pull(msg.sender, BOND);
    }

    /// Step 2: reveal at least one block and at most REVEAL_WINDOW after a commit made while the photo was accusable.
    /// Attested: asserts the accusation at UMA with the claimant's bond and disputes it with the photo's deposit.
    /// Fake, or Accused (another accusation is open on this photo): no new accusation, the commitment is consumed and
    /// the bond is credited back (returns 0, emits BondReturned). The claimant may commit again later.
    function revealClaim(bytes32 photoHash, bytes32 keyId, bytes32 evidenceHash, bytes32 salt) external returns (bytes32 assertionId) {
        bytes32 cm = keccak256(abi.encode(msg.sender, photoHash, keyId, evidenceHash, salt));
        Commit storage k = commits[cm];
        require(k.claimant == msg.sender && k.live, "no commit");
        require(block.number > k.committedBlock, "too early");
        require(block.timestamp <= k.committedAt + REVEAL_WINDOW, "too late");
        Record storage r = records[photoHash][keyId];
        require(r.state != State.None, "no record");
        require(r.state != State.Refunded, "refunded");
        require(k.committedBlock >= r.recordedBlock && k.committedAt <= r.accusableUntil, "outside window");
        k.live = false;
        // Already proven fake, or already under accusation (UMA judges one accusation per photo at a time): nothing
        // to judge now, the bond goes back. A waiting accuser never loses its bond to a vote that outlasts its
        // REVEAL_WINDOW; it can commit again once the open accusation is settled.
        if (r.state == State.Fake || r.state == State.Accused) {
            _credit(msg.sender, BOND);
            emit BondReturned(cm, msg.sender);
            return bytes32(0);
        }
        r.state = State.Accused;
        // UMA pulls one bond from the asserter and one from the disputer; Paprika is both
        _call(address(currency), abi.encodeCall(IERC20.approve, (address(oo), 2 * BOND)));
        bytes memory claim = abi.encodePacked("Paprika accusation: the photo with SHA-256 0x", _hex(photoHash),
            " attested by the device key with id 0x", _hex(keyId), " is not a genuine capture by that device. Evidence SHA-256: 0x",
            _hex(evidenceHash), ".");
        assertionId = oo.assertTruth(claim, address(this), address(this), address(0), LIVENESS, currency, BOND, identifier, bytes32(0));
        accusations[assertionId] = Accusation(photoHash, keyId, msg.sender, uint64(block.timestamp), true);
        emit AccusationOpened(assertionId, photoHash, keyId, msg.sender, evidenceHash);
        // Dispute at once with the photo's deposit: an undisputed assertion would be accepted by silence after
        // LIVENESS; disputing it ourselves sends every accusation to UMA's vote.
        oo.disputeAssertion(assertionId, address(this));
    }

    /// Anyone. Checks: the commitment is live and its REVEAL_WINDOW is over. Sends its BOND to the burn address.
    function forfeitCommit(bytes32 commitment) external {
        Commit storage k = commits[commitment];
        require(k.live, "no commit");
        require(block.timestamp > k.committedAt + REVEAL_WINDOW, "reveal open");
        k.live = false;
        emit CommitForfeited(commitment);
        _call(address(currency), abi.encodeCall(IERC20.transfer, (BURN, BOND)));
    }

    /// UMA, inside settleAssertion, after paying this contract (asserter and disputer) 2 x BOND - fee.
    /// Proven: the photo is Fake for good, the claimant gets the payout. Rejected: the deposit is restored, the
    /// depositor gets the rest, and the accusation window is extended by the time spent under accusation.
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external onlyOO {
        Accusation storage a = accusations[assertionId];
        if (!a.open) return;   // not an accusation of this contract: nothing to do
        a.open = false;
        Record storage r = records[a.photoHash][a.keyId];
        // what UMA just paid us: both bonds minus its fee share (read from UMA, not assumed)
        uint256 payout = 2 * BOND - BOND * oo.burnedBondPercentage() / 1e18;
        if (assertedTruthfully) {
            r.state = State.Fake;
            Device storage d = devices[a.keyId];
            if (d.status == Status.Active) _flag(d, a.keyId, Reason.FakeProven);
            _credit(a.claimant, payout);
        } else {
            r.state = State.Attested;
            // While accused nobody else could accuse it; give that time back so the window cannot be run out by
            // accusations that fail (for example the forger accusing itself with no evidence).
            r.accusableUntil += uint64(block.timestamp) - a.openedAt;
            _credit(r.depositor, payout - BOND);
        }
        emit AccusationResolved(assertionId, assertedTruthfully, r.accusableUntil);
    }

    /// UMA, inside disputeAssertion. Paprika disputes its own assertions; nothing to do.
    function assertionDisputedCallback(bytes32) external view onlyOO {}

    /// Anyone holding the key. Checks: the device is Active; sig is the key's signature over
    /// sha256("PAPRIKA/REVOKE" || chainid || this contract || keyId || msg.sender). Flags the device (KeyRevoked);
    /// existing records and deposits are untouched; no money moves.
    function revokeKey(bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status == Status.Active, "not active");
        require(_p256(_namedDigest("PAPRIKA/REVOKE", keyId), sig, d.x, d.y), "bad sig");
        _flag(d, keyId, Reason.KeyRevoked);
    }

    /// Anyone with a credit. Payouts are credits rather than direct transfers so that an account that cannot receive
    /// tokens only blocks its own withdrawal, never a refund or a settlement.
    function withdrawCredit() external {
        uint256 amount = credits[msg.sender];
        require(amount > 0, "no credit");
        credits[msg.sender] = 0;
        emit CreditWithdrawn(msg.sender, amount);
        _call(address(currency), abi.encodeCall(IERC20.transfer, (msg.sender, amount)));
    }

    /// Anyone (view). Everything a verifier needs about one photo and one key. recordedBeforeFlag: the record exists
    /// and was made before the device was flagged (a record in the flag's own block counts as not before).
    function verify(bytes32 photoHash, bytes32 keyId) external view returns (View memory v) {
        Record storage r = records[photoHash][keyId];
        Device storage d = devices[keyId];
        (v.state, v.anchorBlock, v.recordedBlock, v.accusableUntil) = (r.state, r.anchorBlock, r.recordedBlock, r.accusableUntil);
        v.refundableAt = r.state == State.None ? 0 : uint256(r.accusableUntil) + REVEAL_WINDOW + 1;
        v.depositor = r.depositor;
        v.lockedDeposit = r.state == State.Attested || r.state == State.Accused ? BOND : 0;   // while Accused: held by UMA
        (v.deviceStatus, v.flaggedAtBlock, v.reason) = (d.status, d.flaggedAtBlock, d.reason);
        v.recordedBeforeFlag = r.state != State.None && (d.status != Status.Flagged || r.recordedBlock < d.flaggedAtBlock);
    }

    /// The keys that attested this photo hash, oldest first; then call verify(photoHash, keyId) for each.
    function attestersOf(bytes32 photoHash) external view returns (bytes32[] memory) {
        return keysOf[photoHash];
    }

    // ------------------------------------------------------------------ internals
    function _flag(Device storage d, bytes32 keyId, Reason reason) internal {
        (d.status, d.reason, d.flaggedAtBlock) = (Status.Flagged, reason, uint64(block.number));
        emit DeviceFlagged(keyId, reason);
    }

    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        credits[to] += amount;
        emit Credited(to, amount);
    }

    function _pull(address from, uint256 amount) internal {
        _call(address(currency), abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
    }

    /// ERC-20 call that accepts tokens returning true or nothing.
    function _call(address token, bytes memory data) internal {
        (bool ok, bytes memory ret) = token.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))) && token.code.length > 0, "token call failed");
    }

    function _namedDigest(string memory label, bytes32 keyId) internal view returns (bytes32) {
        return sha256(abi.encodePacked(label, block.chainid, address(this), keyId, msg.sender));
    }

    /// Low-s only. If the precompile is missing the call returns no data and every signature is rejected.
    function _p256(bytes32 h, bytes calldata sig, bytes32 x, bytes32 y) internal view returns (bool) {
        if (sig.length != 64 || uint256(bytes32(sig[32:64])) > HALF_N) return false;
        (bool ok, bytes memory ret) = P256.staticcall(abi.encodePacked(h, sig, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }

    function _hex(bytes32 b) internal pure returns (bytes memory s) {
        s = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            uint8 n = uint8(b[i / 2]) >> (i % 2 == 0 ? 4 : 0) & 0x0f;
            s[i] = bytes1(n < 10 ? n + 48 : n + 87);
        }
    }
}
