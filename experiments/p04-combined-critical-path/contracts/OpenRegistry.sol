// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Barretenberg-generated UltraHonk verifier (contracts/HonkVerifier.sol).
interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @title OpenRegistry - ORIGO anonymous photo attestation + open bonded issuers + objective revocation.
/// No owner, no admin, no committee, no upgrade path. SPIKE CODE, NOT AUDITED.
///
/// What a device signs (standard ECDSA P-256 with SHA-256 over a byte payload; low-s for captures):
///   capture payload (134 bytes) = "ORIGO-P/CAPTURE/v1" (18) || chainid (32, big-endian)
///                                 || address(this) (20) || imageDigest (32) || blockhash(anchorBlock) (32)
///   m = SHA-256(capture payload)                -> public input of the zero-knowledge proof
///   misuse payload (89 bytes)   = "ORIGO-P/MISUSE/v1" (17) || chainid (32) || address(this) (20) || challenger (20)
///   hash = SHA-256(misuse payload)              -> checked with the P-256 precompile at 0x100
/// Circuit hashes (recomputed here): leaf = SHA-256(0x00||x||y), node = SHA-256(0x01||l||r),
///   tag = SHA-256(0x02||x||y||m).
contract OpenRegistry {
    uint256 public constant MIN_BOND = 1 ether;
    uint256 public constant BOUNTY = 0.25 ether;
    uint256 public constant UNBONDING_BLOCKS = 100;
    uint256 public constant DEPTH = 10;
    address internal constant P256_VERIFY = address(0x100);
    bytes18 internal constant CAPTURE_LABEL = "ORIGO-P/CAPTURE/v1";
    bytes17 internal constant MISUSE_LABEL = "ORIGO-P/MISUSE/v1";

    IHonkVerifier public immutable verifier;

    struct Issuer { bool registered; uint256 bond; uint64 registeredAt; uint64 exitRequestedAt; }
    struct Root { address issuer; uint64 publishedAt; uint64 deactivatedAt; }
    struct Record { bytes32 imageDigest; bytes32 root; bytes32 m; uint64 anchorBlock; uint64 recordedAt; }
    struct RevokedKey { bytes32 pkX; bytes32 pkY; uint64 revokedAt; address challenger; }
    struct Status {
        Record record;            // recordedAt == 0 => unknown tag
        address issuer;
        uint64 rootPublishedAt;
        uint64 rootInactiveSince; // 0 = active; else min(deactivation block, issuer exit-request block)
        bool keyRevoked;          // the record's tag belongs to a key proven misusable
        uint64 keyRevokedAt;      // block at which that key was first proven misusable
    }

    mapping(address => Issuer) public issuers;
    mapping(bytes32 => Root) public roots;
    mapping(bytes32 => Record) internal records;                    // tag => record, never deleted
    mapping(bytes32 => bytes32[]) internal tagsByImage;             // imageDigest => tags
    mapping(bytes32 => uint64) public keyRevokedAt;                 // leaf hash => first revocation block
    mapping(bytes32 => RevokedKey[]) internal revokedByRoot;        // root => revoked keys that are leaves of it
    mapping(bytes32 => mapping(bytes32 => bool)) public listedInRoot; // root => leaf => listed

    event IssuerRegistered(address indexed issuer, uint256 bond);
    event RootPublished(address indexed issuer, bytes32 indexed root);
    event RootDeactivated(address indexed issuer, bytes32 indexed root);
    event ExitRequested(address indexed issuer, uint256 withdrawableAt);
    event BondWithdrawn(address indexed issuer, uint256 amount);
    event Attested(bytes32 indexed tag, bytes32 indexed imageDigest, bytes32 indexed root, uint256 anchorBlock);
    event KeyMisuseProven(bytes32 indexed root, bytes32 indexed leaf, address indexed challenger, uint256 paid);

    constructor(IHonkVerifier verifier_) { verifier = verifier_; }

    // ---------------------------------------------------------------- issuers
    function registerIssuer() external payable {
        Issuer storage i = issuers[msg.sender];
        require(!i.registered, "already registered");
        require(msg.value >= MIN_BOND, "bond too small");
        issuers[msg.sender] = Issuer(true, msg.value, uint64(block.number), 0);
        emit IssuerRegistered(msg.sender, msg.value);
    }

    function publishRoot(bytes32 root) external {
        Issuer storage i = issuers[msg.sender];
        require(i.registered && i.exitRequestedAt == 0, "not an active issuer");
        require(i.bond >= MIN_BOND, "bond below minimum");
        require(root != bytes32(0) && roots[root].issuer == address(0), "root taken"); // global uniqueness (O-11)
        roots[root] = Root(msg.sender, uint64(block.number), 0);
        emit RootPublished(msg.sender, root);
    }

    /// Prospective and permanent: records made before stay as they are.
    function deactivateRoot(bytes32 root) external {
        Root storage r = roots[root];
        require(r.issuer == msg.sender, "not your root");
        require(r.deactivatedAt == 0, "already deactivated");
        r.deactivatedAt = uint64(block.number);
        emit RootDeactivated(msg.sender, root);
    }

    /// Starts unbonding. From this block on, the issuer's roots accept no new attestations (prospective),
    /// but misuse proofs against its keys still pay out of the bond until it is withdrawn.
    function requestExit() external {
        Issuer storage i = issuers[msg.sender];
        require(i.registered && i.exitRequestedAt == 0, "not an active issuer");
        i.exitRequestedAt = uint64(block.number);
        emit ExitRequested(msg.sender, block.number + UNBONDING_BLOCKS);
    }

    function withdrawBond() external {
        Issuer storage i = issuers[msg.sender];
        require(i.exitRequestedAt != 0, "no exit requested");
        require(block.number >= i.exitRequestedAt + UNBONDING_BLOCKS, "unbonding");
        uint256 amount = i.bond;
        i.bond = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit BondWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- attestation
    function captureMessage(bytes32 imageDigest, bytes32 anchorHash) public view returns (bytes32) {
        return sha256(abi.encodePacked(CAPTURE_LABEL, block.chainid, address(this), imageDigest, anchorHash));
    }

    function attest(bytes32 imageDigest, uint256 anchorBlock, bytes32 root, bytes32 tag, bytes calldata proof) external {
        require(anchorBlock < block.number, "anchor not in the past");
        bytes32 anchorHash = blockhash(anchorBlock);
        require(anchorHash != bytes32(0), "anchor hash unavailable"); // zero-hash trap, > 256 blocks (O-06)
        require(rootInactiveSince(root) == 0, "root not active");
        require(records[tag].recordedAt == 0, "tag already recorded");
        bytes32 m = captureMessage(imageDigest, anchorHash);
        // The key is hidden, but its tag for this m is a public function of (pk, m): reject revoked keys.
        require(_revokedAtForTag(root, m, tag) == 0, "key revoked");

        bytes32[] memory inputs = new bytes32[](6);
        inputs[0] = m >> 128; inputs[1] = bytes32(uint256(uint128(uint256(m))));
        inputs[2] = root >> 128; inputs[3] = bytes32(uint256(uint128(uint256(root))));
        inputs[4] = tag >> 128; inputs[5] = bytes32(uint256(uint128(uint256(tag))));
        require(verifier.verify(proof, inputs), "proof rejected");

        records[tag] = Record(imageDigest, root, m, uint64(anchorBlock), uint64(block.number));
        tagsByImage[imageDigest].push(tag);
        emit Attested(tag, imageDigest, root, anchorBlock);
    }

    // ---------------------------------------------------------------- revocation by proof of key misuse
    function misuseMessage(address challenger) public view returns (bytes32) {
        return sha256(abi.encodePacked(MISUSE_LABEL, block.chainid, address(this), challenger));
    }

    /// pathBits bit i = 1 means the running node is the RIGHT child at level i (as `path_is_right` in the circuit).
    function proveKeyMisuse(bytes32 root, bytes32 pkX, bytes32 pkY, bytes32[DEPTH] calldata path, uint256 pathBits, bytes32 r, bytes32 s)
        external
    {
        Root storage rt = roots[root];
        require(rt.issuer != address(0), "unknown root");
        bytes32 leaf = sha256(abi.encodePacked(bytes1(0x00), pkX, pkY));
        bytes32 node = leaf;
        for (uint256 i = 0; i < DEPTH; i++) {
            node = (pathBits >> i) & 1 == 1
                ? sha256(abi.encodePacked(bytes1(0x01), path[i], node))
                : sha256(abi.encodePacked(bytes1(0x01), node, path[i]));
        }
        require(node == root, "not a leaf of root");
        require(!listedInRoot[root][leaf], "already revoked");
        (bool ok, bytes memory out) = P256_VERIFY.staticcall(abi.encodePacked(misuseMessage(msg.sender), r, s, pkX, pkY));
        require(ok && out.length == 32 && uint256(bytes32(out)) == 1, "bad misuse signature");

        listedInRoot[root][leaf] = true;
        uint256 paid = 0;
        if (keyRevokedAt[leaf] == 0) {
            // First proof for this key: revoke from this block and pay the bounty from the root's issuer.
            keyRevokedAt[leaf] = uint64(block.number);
            Issuer storage iss = issuers[rt.issuer];
            paid = iss.bond < BOUNTY ? iss.bond : BOUNTY;
            iss.bond -= paid;
        }
        // A key that is a leaf of several roots is listed under each (no second bounty), so attest/statusOf
        // can find it by looping over the record's root only.
        revokedByRoot[root].push(RevokedKey(pkX, pkY, keyRevokedAt[leaf], msg.sender));
        emit KeyMisuseProven(root, leaf, msg.sender, paid);
        if (paid > 0) {
            (bool sent,) = msg.sender.call{value: paid}("");
            require(sent, "transfer failed");
        }
    }

    // ---------------------------------------------------------------- reading
    function rootInactiveSince(bytes32 root) public view returns (uint64) {
        Root storage r = roots[root];
        if (r.issuer == address(0)) return type(uint64).max; // never published
        uint64 exitAt = issuers[r.issuer].exitRequestedAt;
        uint64 d = r.deactivatedAt;
        if (d == 0) return exitAt;
        if (exitAt == 0) return d;
        return d < exitAt ? d : exitAt;
    }

    function statusOf(bytes32 tag) external view returns (Status memory st) {
        Record memory rec = records[tag];
        st.record = rec;
        if (rec.recordedAt == 0) return st;
        st.issuer = roots[rec.root].issuer;
        st.rootPublishedAt = roots[rec.root].publishedAt;
        st.rootInactiveSince = rootInactiveSince(rec.root);
        st.keyRevokedAt = _revokedAtForTag(rec.root, rec.m, tag);
        st.keyRevoked = st.keyRevokedAt != 0;
    }

    function tagsOf(bytes32 imageDigest) external view returns (bytes32[] memory) { return tagsByImage[imageDigest]; }
    function revokedCount(bytes32 root) external view returns (uint256) { return revokedByRoot[root].length; }

    /// O(number of keys revoked under `root`) SHA-256 calls.
    function _revokedAtForTag(bytes32 root, bytes32 m, bytes32 tag) internal view returns (uint64) {
        RevokedKey[] storage list = revokedByRoot[root];
        for (uint256 i = 0; i < list.length; i++) {
            if (sha256(abi.encodePacked(bytes1(0x02), list[i].pkX, list[i].pkY, m)) == tag) return list[i].revokedAt;
        }
        return 0;
    }
}
