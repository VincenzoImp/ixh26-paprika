// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// PaprikaCore: the smallest sound subset of Paprika v2.5 - no oracle, no claims, no commit-reveal, no vote.
/// What remains: bonded issuers (level 1), staked device keys with proof of possession, relayed attestations with a
/// block-hash anchor, and the objective proof of key misuse, which pays at once. No owner, no admin, no upgrade.
contract PaprikaCore {
    uint256 public constant MIN_STAKE = 0.25 ether;
    uint256 public constant REWARD_BPS = 5000;
    uint256 public constant UNBONDING_PERIOD = 30 days;
    uint256 public constant ISSUER_MIN_BOND = 1 ether;
    uint256 public constant ISSUER_BOUNTY = 0.1 ether;
    uint256 public constant ISSUER_UNBONDING = UNBONDING_PERIOD;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    address private constant P256 = 0x0000000000000000000000000000000000000100;
    uint256 private constant HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8;    // P-256 n/2
    uint256 private constant HALF_N_K1 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0; // secp256k1 n/2

    enum Status { None, Active, Flagged, Retired }

    struct Device {
        address owner; Status status; uint8 level; uint64 flaggedAtBlock; uint64 unbondAt; uint64 withdrawnAtBlock;
        address issuer; uint256 stake; bytes32 x; bytes32 y;
    }
    struct Record { uint64 anchorBlock; uint64 recordedBlock; }
    struct Issuer {
        bool registered; uint64 exitAt; uint32 keysEndorsed; uint32 keysFlaggedForMisuse;
        uint256 bond; uint256 deposited; uint256 bountiesPaid;
    }

    mapping(bytes32 => Device) internal devices;
    mapping(bytes32 => mapping(bytes32 => Record)) public records;
    mapping(address => Issuer) internal issuers;

    event IssuerBond(address indexed issuer, uint256 bond);
    event IssuerExit(address indexed issuer, uint64 exitAt);
    event Registered(bytes32 indexed keyId, address indexed owner, uint256 stake, address issuer);
    event StakeAdded(bytes32 indexed keyId, uint256 amount);
    event Attested(bytes32 indexed photoHash, bytes32 indexed keyId, uint64 anchorBlock);
    event MisuseProven(bytes32 indexed keyId, address indexed challenger, uint256 reward, uint256 bounty, uint256 burned);
    event UnbondRequested(bytes32 indexed keyId, uint64 unbondAt);
    event Withdrawn(bytes32 indexed keyId, uint256 amount);

    constructor() {
        require(ISSUER_BOUNTY < MIN_STAKE * (10_000 - REWARD_BPS) / 10_000, "bounty too high");   // self-revocation loses
    }

    // ---------------------------------------------------------------- issuers
    function registerIssuer() external payable {
        Issuer storage i = issuers[msg.sender];
        require(msg.value >= ISSUER_MIN_BOND, "issuer bond");
        require(!i.registered, "issuer exists");
        i.registered = true; i.exitAt = 0; i.bond = msg.value; i.deposited += msg.value;   // counters survive re-entry
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

    // ---------------------------------------------------------------- devices
    function register(bytes32 x, bytes32 y, bytes calldata popSig, address issuerAddr, uint8 v, bytes32 r, bytes32 s)
        external payable returns (bytes32 keyId) {
        require(msg.value >= MIN_STAKE, "stake");
        keyId = sha256(abi.encodePacked(x, y));
        Device storage d = devices[keyId];
        require(d.status == Status.None, "key used");
        require(_p256(sha256(abi.encodePacked("PAPRIKA/REGISTER", block.chainid, address(this), keyId, msg.sender)), popSig, x, y), "bad pop");
        d.owner = msg.sender; d.status = Status.Active; d.stake = msg.value; d.x = x; d.y = y;
        if (issuerAddr != address(0)) {
            require(issuerActive(issuerAddr), "issuer inactive");
            require(uint256(s) <= HALF_N_K1 && (v == 27 || v == 28), "bad endorsement");
            address signer = ecrecover(keccak256(abi.encodePacked("PAPRIKA/ENDORSE", block.chainid, address(this), keyId)), v, r, s);
            require(signer != address(0) && signer == issuerAddr, "bad endorsement");
            d.level = 1; d.issuer = issuerAddr;
            issuers[issuerAddr].keysEndorsed++;
        }
        emit Registered(keyId, msg.sender, msg.value, issuerAddr);
    }

    function attest(bytes32 photoHash, uint256 anchorBlock, bytes32 keyId, bytes calldata sig) external payable {
        Device storage d = devices[keyId];
        require(d.status == Status.Active, "not active");
        bytes32 bh = blockhash(anchorBlock);
        require(bh != 0, "anchor");
        Record storage rec = records[photoHash][keyId];
        require(rec.recordedBlock == 0, "exists");
        require(_p256(sha256(abi.encodePacked("PAPRIKA/CAPTURE", block.chainid, address(this), keyId, photoHash, bh)), sig, d.x, d.y), "bad sig");
        rec.anchorBlock = uint64(anchorBlock);
        rec.recordedBlock = uint64(block.number);
        if (msg.value > 0) { d.stake += msg.value; emit StakeAdded(keyId, msg.value); }
        emit Attested(photoHash, keyId, uint64(anchorBlock));
    }

    /// Objective and immediate: a signature on the EXTRACTED domain naming the caller. Pays the caller at once:
    /// REWARD_BPS of the stake, plus for a level-1 key min(ISSUER_BOUNTY, issuer bond, burned part); the rest is burned.
    function proveKeyMisuse(bytes32 keyId, bytes calldata sig) external {
        Device storage d = devices[keyId];
        require(d.status != Status.None, "unknown");
        require(d.status != Status.Flagged, "already misuse");
        require(_p256(sha256(abi.encodePacked("PAPRIKA/EXTRACTED", block.chainid, address(this), keyId, msg.sender)), sig, d.x, d.y), "bad sig");
        d.status = Status.Flagged;
        d.flaggedAtBlock = uint64(block.number);
        uint256 st = d.stake;
        d.stake = 0;
        uint256 reward = st * REWARD_BPS / 10_000;
        uint256 bounty;
        if (d.level == 1) {
            Issuer storage iss = issuers[d.issuer];
            iss.keysFlaggedForMisuse++;
            bounty = ISSUER_BOUNTY;
            if (bounty > iss.bond) bounty = iss.bond;
            if (bounty > st - reward) bounty = st - reward;
            iss.bond -= bounty; iss.bountiesPaid += bounty;
        }
        if (st - reward > 0) _send(BURN, st - reward);
        if (reward + bounty > 0) _send(msg.sender, reward + bounty);   // the caller itself: no third party can block it
        emit MisuseProven(keyId, msg.sender, reward, bounty, st - reward);
    }

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
        uint256 amt = d.stake;
        require(amt > 0, "nothing");
        d.stake = 0;
        d.withdrawnAtBlock = uint64(block.number);
        _send(msg.sender, amt);
        emit Withdrawn(keyId, amt);
    }

    // ---------------------------------------------------------------- verification
    struct View {
        uint64 anchorBlock; uint64 recordedBlock; Status status; uint64 flaggedAtBlock; bool recordedBeforeFlag;
        uint256 stakeAtRisk; uint64 withdrawnAtBlock;
        uint8 level; address issuer; uint256 issuerBond; uint32 keysEndorsed; uint32 keysFlaggedForMisuse; bool issuerActive;
    }
    function verify(bytes32 photoHash, bytes32 keyId) external view returns (View memory w) {
        Record memory rec = records[photoHash][keyId];
        Device storage d = devices[keyId];
        w.anchorBlock = rec.anchorBlock; w.recordedBlock = rec.recordedBlock; w.status = d.status;
        w.flaggedAtBlock = d.flaggedAtBlock;
        w.recordedBeforeFlag = rec.recordedBlock != 0 && (d.status != Status.Flagged || rec.recordedBlock < d.flaggedAtBlock);
        w.stakeAtRisk = d.stake; w.withdrawnAtBlock = d.withdrawnAtBlock; w.level = d.level; w.issuer = d.issuer;
        if (d.issuer != address(0)) {
            Issuer storage i = issuers[d.issuer];
            w.issuerBond = i.bond; w.keysEndorsed = i.keysEndorsed; w.keysFlaggedForMisuse = i.keysFlaggedForMisuse;
            w.issuerActive = issuerActive(d.issuer);
        }
    }

    function device(bytes32 keyId) external view returns (Device memory) { return devices[keyId]; }

    // ---------------------------------------------------------------- internals
    function _send(address to, uint256 amt) internal {
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "send");
    }

    function _p256(bytes32 h, bytes calldata sig, bytes32 x, bytes32 y) internal view returns (bool) {
        if (sig.length != 64) return false;
        if (uint256(bytes32(sig[32:64])) > HALF_N) return false;      // low-s only
        (bool ok, bytes memory ret) = P256.staticcall(abi.encodePacked(h, sig, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
