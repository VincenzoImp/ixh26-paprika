// ORIGO anonymous device attestation.
//
// Statement proved in zero knowledge:
//   "I know an ECDSA P-256 signature on `m` made by a device key that is a leaf of the Merkle tree
//    with root `root`, and `tag` is that key's revocation tag for `m`."
// Public:  m, root, tag  (each 32 bytes, passed as two 128-bit field elements: high half, low half).
// Private: the device public key, the signature, the Merkle path.
//
// All hashes are SHA-256 with one-byte domain separation, so a smart contract can recompute them:
//   leaf = SHA-256(0x00 || pk_x || pk_y)      node = SHA-256(0x01 || left || right)
//   tag  = SHA-256(0x02 || pk_x || pk_y || m)
use sha256::digest;

global DEPTH: u32 = 10; // 1024 devices per batch

fn bytes32(hi: Field, lo: Field) -> [u8; 32] {
    let h: [u8; 16] = hi.to_be_bytes();
    let l: [u8; 16] = lo.to_be_bytes();
    let mut out: [u8; 32] = [0; 32];
    for i in 0..16 {
        out[i] = h[i];
        out[16 + i] = l[i];
    }
    out
}

fn leaf_hash(pk_x: [u8; 32], pk_y: [u8; 32]) -> [u8; 32] {
    let mut buf: [u8; 65] = [0; 65];
    buf[0] = 0;
    for i in 0..32 {
        buf[1 + i] = pk_x[i];
        buf[33 + i] = pk_y[i];
    }
    digest(buf)
}

fn node_hash(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut buf: [u8; 65] = [0; 65];
    buf[0] = 1;
    for i in 0..32 {
        buf[1 + i] = left[i];
        buf[33 + i] = right[i];
    }
    digest(buf)
}

fn tag_hash(pk_x: [u8; 32], pk_y: [u8; 32], m: [u8; 32]) -> [u8; 32] {
    let mut buf: [u8; 97] = [0; 97];
    buf[0] = 2;
    for i in 0..32 {
        buf[1 + i] = pk_x[i];
        buf[33 + i] = pk_y[i];
        buf[65 + i] = m[i];
    }
    digest(buf)
}

fn main(
    m_hi: pub Field,
    m_lo: pub Field,
    root_hi: pub Field,
    root_lo: pub Field,
    tag_hi: pub Field,
    tag_lo: pub Field,
    pk_x: [u8; 32],
    pk_y: [u8; 32],
    signature: [u8; 64],
    path: [[u8; 32]; DEPTH],
    path_is_right: [bool; DEPTH],
) {
    let m = bytes32(m_hi, m_lo);

    // 1. The signature is valid under the hidden device key.
    assert(std::ecdsa_secp256r1::verify_signature(pk_x, pk_y, signature, m));

    // 2. The hidden device key is registered: its leaf is under the public root.
    let mut node = leaf_hash(pk_x, pk_y);
    for i in 0..DEPTH {
        node = if path_is_right[i] { node_hash(path[i], node) } else { node_hash(node, path[i]) };
    }
    assert(node == bytes32(root_hi, root_lo));

    // 3. The revocation tag is correctly derived from the hidden key and this message.
    assert(tag_hash(pk_x, pk_y, m) == bytes32(tag_hi, tag_lo));
}
