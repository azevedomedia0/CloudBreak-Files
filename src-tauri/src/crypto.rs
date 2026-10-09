use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use subtle::ConstantTimeEq;

/// OWASP recommendation for PBKDF2-HMAC-SHA256. Keep in sync with `src/services/rustBridge.ts`.
pub const PBKDF2_ITERATIONS: u32 = 600_000;
pub const KEY_LEN: usize = 32; // 256 bits
pub const NONCE_LEN: usize = 12; // 96 bits
pub const SALT_LEN: usize = 16; // 128 bits
pub const MIN_PASSPHRASE_LEN: usize = 8;
/// Soft cap for session encrypt/decrypt payloads (IPC + memory).
pub const MAX_SESSION_BYTES: usize = 32 * 1024 * 1024;
/// Chunk size for path-based streaming vault encryption (no IPC base64).
pub const STREAM_CHUNK_SIZE: usize = 1024 * 1024;
const STREAM_MAGIC: &[u8; 8] = b"CBSTRM01";
const SESSION_KEY_DOMAIN: &[u8] = b"aethercloud-file-session";

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedAsset {
    pub ciphertext: String,
    pub nonce: String,
    pub salt: String,
    pub key_fingerprint: String,
    pub sha256_checksum: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Encryption failed")]
    EncryptionFailure,
    #[error("Decryption failed - invalid key or corrupted payload")]
    DecryptionFailure,
    #[error("Hex encoding error")]
    HexError(#[from] hex::FromHexError),
    #[error("Invalid nonce length")]
    InvalidNonce,
    #[error("Passphrase must be at least {MIN_PASSPHRASE_LEN} characters")]
    WeakPassphrase,
    #[error("Payload exceeds the {MAX_SESSION_BYTES} byte session limit")]
    PayloadTooLarge,
    #[error("Invalid session key length")]
    InvalidKey,
    #[error("Invalid stream ciphertext")]
    InvalidStream,
    #[error("I/O error: {0}")]
    Io(String),
}

/// Reject empty or short passphrases.
pub fn validate_passphrase(passphrase: &str) -> Result<(), CryptoError> {
    if passphrase.chars().count() < MIN_PASSPHRASE_LEN {
        return Err(CryptoError::WeakPassphrase);
    }
    Ok(())
}

/// Stored proof of the vault passphrase. It never holds the encryption key.
/// It records its own iteration count, so the default can be raised later without locking users out.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PassphraseVerifier {
    iterations: u32,
    #[serde(with = "hex_array_16")]
    salt: [u8; SALT_LEN],
    #[serde(with = "hex_array_32")]
    hash: [u8; KEY_LEN],
}

impl PassphraseVerifier {
    pub fn iterations(&self) -> u32 {
        self.iterations
    }

    pub fn salt(&self) -> &[u8; SALT_LEN] {
        &self.salt
    }

    #[cfg(test)]
    pub fn hash(&self) -> &[u8; KEY_LEN] {
        &self.hash
    }
}

macro_rules! hex_array_module {
    ($name:ident, $len:expr) => {
        mod $name {
            use serde::{Deserialize, Deserializer, Serializer};

            pub fn serialize<S: Serializer>(bytes: &[u8; $len], s: S) -> Result<S::Ok, S::Error> {
                s.serialize_str(&hex::encode(bytes))
            }

            pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; $len], D::Error> {
                let text = String::deserialize(d)?;
                let bytes = hex::decode(text).map_err(serde::de::Error::custom)?;
                bytes
                    .try_into()
                    .map_err(|_| serde::de::Error::custom("wrong byte length"))
            }
        }
    };
}
hex_array_module!(hex_array_16, 16);
hex_array_module!(hex_array_32, 32);

fn verifier_hash(passphrase: &str, salt: &[u8; SALT_LEN], iterations: u32) -> [u8; KEY_LEN] {
    // Domain separation: the verifier differs from the encryption key.
    let mut domain_salt = b"aethercloud-vault-verifier".to_vec();
    domain_salt.extend_from_slice(salt);
    derive_key_with(passphrase, &domain_salt, iterations)
}

pub fn create_verifier(passphrase: &str) -> Result<PassphraseVerifier, CryptoError> {
    validate_passphrase(passphrase)?;
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let hash = verifier_hash(passphrase, &salt, PBKDF2_ITERATIONS);
    Ok(PassphraseVerifier { iterations: PBKDF2_ITERATIONS, salt, hash })
}

/// Constant-time check of a passphrase against a verifier.
pub fn verify_passphrase(verifier: &PassphraseVerifier, passphrase: &str) -> bool {
    if verifier.iterations == 0 {
        return false;
    }
    let candidate = verifier_hash(passphrase, &verifier.salt, verifier.iterations);
    candidate.ct_eq(&verifier.hash).into()
}

/// Derive AES-256 key from passphrase and salt using PBKDF2-HMAC-SHA256
pub fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; KEY_LEN] {
    derive_key_with(passphrase, salt, PBKDF2_ITERATIONS)
}

fn derive_key_with(passphrase: &str, salt: &[u8], iterations: u32) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2::<Hmac<Sha256>>(passphrase.as_bytes(), salt, iterations, &mut key)
        .expect("PBKDF2 key derivation failed");
    key
}

/// File-encryption session key. Domain-separated from the vault verifier so the
/// verifier hash can never decrypt file blobs. Stable across unlocks for the same
/// passphrase + verifier salt.
pub fn derive_session_key(
    passphrase: &str,
    verifier_salt: &[u8; SALT_LEN],
    iterations: u32,
) -> [u8; KEY_LEN] {
    let mut domain_salt = SESSION_KEY_DOMAIN.to_vec();
    domain_salt.extend_from_slice(verifier_salt);
    derive_key_with(passphrase, &domain_salt, iterations)
}

/// Encrypt with a raw AES-256 key and caller-supplied salt/nonce (interop tests).
/// Salt is stored only; it is not used for key derivation.
pub fn encrypt_with_key_nonce(
    data: &[u8],
    key: &[u8; KEY_LEN],
    salt: &[u8; SALT_LEN],
    nonce_bytes: &[u8; NONCE_LEN],
) -> Result<EncryptedAsset, CryptoError> {
    if data.len() > MAX_SESSION_BYTES {
        return Err(CryptoError::PayloadTooLarge);
    }

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::InvalidKey)?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|_| CryptoError::EncryptionFailure)?;

    Ok(EncryptedAsset {
        ciphertext: hex::encode(ciphertext),
        nonce: hex::encode(nonce_bytes),
        salt: hex::encode(salt),
        key_fingerprint: compute_key_fingerprint(key),
        sha256_checksum: compute_sha256(data),
    })
}

/// Encrypt with a raw AES-256 key (vault session key). Salt is random and unused
/// for derivation; it keeps the on-wire format identical to passphrase encrypt.
pub fn encrypt_with_key(data: &[u8], key: &[u8; KEY_LEN]) -> Result<EncryptedAsset, CryptoError> {
    let mut rng = rand::thread_rng();
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill_bytes(&mut salt);
    rng.fill_bytes(&mut nonce_bytes);
    encrypt_with_key_nonce(data, key, &salt, &nonce_bytes)
}

/// Decrypt a payload produced by `encrypt_with_key`.
pub fn decrypt_with_key(encrypted: &EncryptedAsset, key: &[u8; KEY_LEN]) -> Result<Vec<u8>, CryptoError> {
    let nonce_bytes = hex::decode(&encrypted.nonce)?;
    let ciphertext = hex::decode(&encrypted.ciphertext)?;

    if ciphertext.len() > MAX_SESSION_BYTES + 16 {
        return Err(CryptoError::PayloadTooLarge);
    }
    if nonce_bytes.len() != NONCE_LEN {
        return Err(CryptoError::InvalidNonce);
    }

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::InvalidKey)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| CryptoError::DecryptionFailure)
}

/// Result of streaming a file through the vault session key (path → path).
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEncryptResult {
    pub output_path: String,
    pub salt: String,
    pub key_fingerprint: String,
    pub sha256_checksum: String,
    pub size_bytes: u64,
    pub chunk_count: u32,
    pub algorithm: String,
}

/// Encrypt a file on disk in 1 MiB AES-GCM chunks. No size cap (not IPC-bound).
pub fn encrypt_file_stream(
    src: &Path,
    dst: &Path,
    key: &[u8; KEY_LEN],
) -> Result<StreamEncryptResult, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::InvalidKey)?;
    let mut rng = rand::thread_rng();
    let mut salt = [0u8; SALT_LEN];
    rng.fill_bytes(&mut salt);

    let mut input = File::open(src).map_err(|e| CryptoError::Io(e.to_string()))?;
    let mut output = File::create(dst).map_err(|e| CryptoError::Io(e.to_string()))?;
    output
        .write_all(STREAM_MAGIC)
        .map_err(|e| CryptoError::Io(e.to_string()))?;
    output
        .write_all(&salt)
        .map_err(|e| CryptoError::Io(e.to_string()))?;
    // Placeholder for chunk_count (filled at end).
    let count_pos = STREAM_MAGIC.len() + SALT_LEN;
    output
        .write_all(&0u32.to_le_bytes())
        .map_err(|e| CryptoError::Io(e.to_string()))?;

    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; STREAM_CHUNK_SIZE];
    let mut chunk_count: u32 = 0;
    let mut total: u64 = 0;
    loop {
        let n = input.read(&mut buf).map_err(|e| CryptoError::Io(e.to_string()))?;
        if n == 0 {
            break;
        }
        let chunk = &buf[..n];
        hasher.update(chunk);
        total += n as u64;
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ct = cipher
            .encrypt(nonce, chunk)
            .map_err(|_| CryptoError::EncryptionFailure)?;
        output
            .write_all(&nonce_bytes)
            .map_err(|e| CryptoError::Io(e.to_string()))?;
        output
            .write_all(&(ct.len() as u32).to_le_bytes())
            .map_err(|e| CryptoError::Io(e.to_string()))?;
        output
            .write_all(&ct)
            .map_err(|e| CryptoError::Io(e.to_string()))?;
        chunk_count += 1;
    }

    // Rewrite chunk count at fixed offset.
    use std::io::{Seek, SeekFrom};
    output
        .seek(SeekFrom::Start(count_pos as u64))
        .map_err(|e| CryptoError::Io(e.to_string()))?;
    output
        .write_all(&chunk_count.to_le_bytes())
        .map_err(|e| CryptoError::Io(e.to_string()))?;
    output.flush().map_err(|e| CryptoError::Io(e.to_string()))?;

    Ok(StreamEncryptResult {
        output_path: dst.to_string_lossy().into_owned(),
        salt: hex::encode(salt),
        key_fingerprint: compute_key_fingerprint(key),
        sha256_checksum: hex::encode(hasher.finalize()),
        size_bytes: total,
        chunk_count,
        algorithm: "AES-256-GCM-STREAM".into(),
    })
}

/// Decrypt a CBSTRM01 file written by `encrypt_file_stream`.
pub fn decrypt_file_stream(
    src: &Path,
    dst: &Path,
    key: &[u8; KEY_LEN],
) -> Result<(u64, String), CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::InvalidKey)?;
    let mut input = File::open(src).map_err(|e| CryptoError::Io(e.to_string()))?;
    let mut magic = [0u8; 8];
    input
        .read_exact(&mut magic)
        .map_err(|_| CryptoError::InvalidStream)?;
    if &magic != STREAM_MAGIC {
        return Err(CryptoError::InvalidStream);
    }
    let mut salt = [0u8; SALT_LEN];
    input
        .read_exact(&mut salt)
        .map_err(|_| CryptoError::InvalidStream)?;
    let mut count_buf = [0u8; 4];
    input
        .read_exact(&mut count_buf)
        .map_err(|_| CryptoError::InvalidStream)?;
    let chunk_count = u32::from_le_bytes(count_buf);

    let mut output = File::create(dst).map_err(|e| CryptoError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut total: u64 = 0;
    for _ in 0..chunk_count {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        input
            .read_exact(&mut nonce_bytes)
            .map_err(|_| CryptoError::InvalidStream)?;
        let mut len_buf = [0u8; 4];
        input
            .read_exact(&mut len_buf)
            .map_err(|_| CryptoError::InvalidStream)?;
        let ct_len = u32::from_le_bytes(len_buf) as usize;
        if ct_len > STREAM_CHUNK_SIZE + 32 {
            return Err(CryptoError::InvalidStream);
        }
        let mut ct = vec![0u8; ct_len];
        input
            .read_exact(&mut ct)
            .map_err(|_| CryptoError::InvalidStream)?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plain = cipher
            .decrypt(nonce, ct.as_ref())
            .map_err(|_| CryptoError::DecryptionFailure)?;
        hasher.update(&plain);
        output
            .write_all(&plain)
            .map_err(|e| CryptoError::Io(e.to_string()))?;
        total += plain.len() as u64;
    }
    output.flush().map_err(|e| CryptoError::Io(e.to_string()))?;
    Ok((total, hex::encode(hasher.finalize())))
}

/// Compute SHA-256 checksum of raw bytes
pub fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Compute formatted fingerprint for key material
pub fn compute_key_fingerprint(key: &[u8]) -> String {
    let hash = compute_sha256(key);
    let chunks: Vec<&str> = hash
        .as_bytes()
        .chunks(2)
        .map(|c| std::str::from_utf8(c).unwrap_or("00"))
        .take(8)
        .collect();
    chunks.join(":")
}

/// Encrypt with a caller-supplied salt and nonce (deterministic; for interop tests).
pub fn encrypt_bytes_with(
    data: &[u8],
    passphrase: &str,
    salt: &[u8; SALT_LEN],
    nonce_bytes: &[u8; NONCE_LEN],
) -> Result<EncryptedAsset, CryptoError> {
    validate_passphrase(passphrase)?;
    let key = derive_key(passphrase, salt);
    encrypt_with_key_nonce(data, &key, salt, nonce_bytes).map_err(|e| match e {
        CryptoError::InvalidKey => CryptoError::EncryptionFailure,
        other => other,
    })
}

/// Encrypt plaintext with AES-256-GCM and return structured payload
pub fn encrypt_bytes(data: &[u8], passphrase: &str) -> Result<EncryptedAsset, CryptoError> {
    validate_passphrase(passphrase)?;
    let mut rng = rand::thread_rng();
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill_bytes(&mut salt);
    rng.fill_bytes(&mut nonce_bytes);
    encrypt_bytes_with(data, passphrase, &salt, &nonce_bytes)
}

/// Decrypt AES-256-GCM ciphertext
pub fn decrypt_bytes(encrypted: &EncryptedAsset, passphrase: &str) -> Result<Vec<u8>, CryptoError> {
    let salt = hex::decode(&encrypted.salt)?;
    let nonce_bytes = hex::decode(&encrypted.nonce)?;
    let ciphertext = hex::decode(&encrypted.ciphertext)?;

    if nonce_bytes.len() != NONCE_LEN {
        return Err(CryptoError::InvalidNonce);
    }

    let key = derive_key(passphrase, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| CryptoError::DecryptionFailure)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| CryptoError::DecryptionFailure)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASS: &str = "correct horse battery";

    #[test]
    fn round_trip() {
        let enc = encrypt_bytes(b"hello vault", PASS).unwrap();
        assert_ne!(enc.ciphertext, hex::encode(b"hello vault"));
        assert_eq!(decrypt_bytes(&enc, PASS).unwrap(), b"hello vault");
    }

    #[test]
    fn stream_file_round_trip() {
        let dir = std::env::temp_dir().join(format!("cb-stream-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("plain.bin");
        let enc_path = dir.join("plain.cbenc");
        let out = dir.join("out.bin");
        let mut data = vec![0u8; STREAM_CHUNK_SIZE + 100];
        rand::thread_rng().fill_bytes(&mut data);
        std::fs::write(&src, &data).unwrap();
        let key = [7u8; KEY_LEN];
        let meta = encrypt_file_stream(&src, &enc_path, &key).unwrap();
        assert_eq!(meta.chunk_count, 2);
        let (size, hash) = decrypt_file_stream(&enc_path, &out, &key).unwrap();
        assert_eq!(size, data.len() as u64);
        assert_eq!(hash, meta.sha256_checksum);
        assert_eq!(std::fs::read(&out).unwrap(), data);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn wrong_passphrase_fails() {
        let enc = encrypt_bytes(b"secret", PASS).unwrap();
        assert!(decrypt_bytes(&enc, "another passphrase").is_err());
    }

    #[test]
    fn tamper_fails() {
        let mut enc = encrypt_bytes(b"secret", PASS).unwrap();
        let mut bytes = hex::decode(&enc.ciphertext).unwrap();
        bytes[0] ^= 0x01;
        enc.ciphertext = hex::encode(bytes);
        assert!(decrypt_bytes(&enc, PASS).is_err());
    }

    #[test]
    fn bad_nonce_length_does_not_panic() {
        let mut enc = encrypt_bytes(b"secret", PASS).unwrap();
        enc.nonce = "00".into();
        assert!(matches!(decrypt_bytes(&enc, PASS), Err(CryptoError::InvalidNonce)));
    }

    #[test]
    fn short_passphrase_rejected() {
        assert!(encrypt_bytes(b"x", "short").is_err());
        assert!(create_verifier("short").is_err());
    }

    #[test]
    fn verifier_works() {
        let v = create_verifier(PASS).unwrap();
        assert!(verify_passphrase(&v, PASS));
        assert!(!verify_passphrase(&v, "wrong passphrase"));
    }

    #[test]
    fn verifier_survives_json_round_trip() {
        let v = create_verifier(PASS).unwrap();
        let json = serde_json::to_string(&v).unwrap();
        let back: PassphraseVerifier = serde_json::from_str(&json).unwrap();
        assert!(verify_passphrase(&back, PASS));
        assert!(!verify_passphrase(&back, "wrong passphrase"));
        assert!(!json.contains(PASS));
    }

    #[test]
    fn malformed_verifier_json_is_rejected() {
        let bad = r#"{"iterations":600000,"salt":"00","hash":"00"}"#;
        assert!(serde_json::from_str::<PassphraseVerifier>(bad).is_err());
    }

    #[test]
    fn nonces_and_salts_are_unique() {
        let a = encrypt_bytes(b"same", PASS).unwrap();
        let b = encrypt_bytes(b"same", PASS).unwrap();
        assert_ne!(a.nonce, b.nonce);
        assert_ne!(a.salt, b.salt);
        assert_ne!(a.ciphertext, b.ciphertext);
    }

    #[test]
    fn session_key_round_trip() {
        let verifier = create_verifier(PASS).unwrap();
        let key = derive_session_key(PASS, verifier.salt(), verifier.iterations());
        let enc = encrypt_with_key(b"session payload", &key).unwrap();
        assert_eq!(decrypt_with_key(&enc, &key).unwrap(), b"session payload");
    }

    #[test]
    fn session_key_differs_from_verifier_hash() {
        let verifier = create_verifier(PASS).unwrap();
        let session = derive_session_key(PASS, verifier.salt(), verifier.iterations());
        assert_ne!(&session, verifier.hash());
    }

    #[test]
    fn wrong_session_key_fails() {
        let verifier = create_verifier(PASS).unwrap();
        let key = derive_session_key(PASS, verifier.salt(), verifier.iterations());
        let enc = encrypt_with_key(b"secret", &key).unwrap();
        let other = derive_session_key("another passphrase", verifier.salt(), verifier.iterations());
        assert!(decrypt_with_key(&enc, &other).is_err());
    }

    #[test]
    fn session_payload_too_large_rejected() {
        let key = [7u8; KEY_LEN];
        let huge = vec![0u8; MAX_SESSION_BYTES + 1];
        assert!(matches!(
            encrypt_with_key(&huge, &key),
            Err(CryptoError::PayloadTooLarge)
        ));
    }

    /// Fixed salt/nonce vectors shared with `scripts/cross-crypto-roundtrip.mts`.
    fn interop_salt() -> [u8; SALT_LEN] {
        let mut salt = [0u8; SALT_LEN];
        for (i, b) in salt.iter_mut().enumerate() {
            *b = (i as u8).wrapping_add(1);
        }
        salt
    }

    fn interop_nonce() -> [u8; NONCE_LEN] {
        let mut nonce = [0u8; NONCE_LEN];
        for (i, b) in nonce.iter_mut().enumerate() {
            *b = (0xA0u8).wrapping_add(i as u8);
        }
        nonce
    }

    #[test]
    fn deterministic_passphrase_encrypt_is_stable() {
        let salt = interop_salt();
        let nonce = interop_nonce();
        let a = encrypt_bytes_with(b"cross-crypto hello", PASS, &salt, &nonce).unwrap();
        let b = encrypt_bytes_with(b"cross-crypto hello", PASS, &salt, &nonce).unwrap();
        assert_eq!(a.ciphertext, b.ciphertext);
        assert_eq!(a.key_fingerprint, b.key_fingerprint);
        assert_eq!(a.sha256_checksum, b.sha256_checksum);
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct InteropFixture {
        passphrase: String,
        plaintext: String,
        salt_hex: String,
        nonce_hex: String,
        passphrase_encrypt: EncryptedAsset,
        session_encrypt: EncryptedAsset,
        session_key_fingerprint: String,
        verifier: InteropVerifier,
    }

    #[derive(serde::Deserialize)]
    struct InteropVerifier {
        iterations: u32,
        salt: String,
        hash: String,
    }

    fn load_interop_fixture() -> InteropFixture {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/crypto-interop.json");
        let text = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("missing interop fixture at {}: {e}", path.display()));
        serde_json::from_str(&text).expect("invalid interop fixture JSON")
    }

    #[test]
    fn rust_matches_committed_interop_fixture() {
        let fixture = load_interop_fixture();
        assert_eq!(fixture.passphrase, PASS);
        assert_eq!(fixture.plaintext, "cross-crypto hello");

        let salt: [u8; SALT_LEN] = hex::decode(&fixture.salt_hex).unwrap().try_into().unwrap();
        let nonce: [u8; NONCE_LEN] = hex::decode(&fixture.nonce_hex).unwrap().try_into().unwrap();
        let plain = fixture.plaintext.as_bytes();

        let pass_enc = encrypt_bytes_with(plain, PASS, &salt, &nonce).unwrap();
        assert_eq!(pass_enc.ciphertext, fixture.passphrase_encrypt.ciphertext);
        assert_eq!(pass_enc.key_fingerprint, fixture.passphrase_encrypt.key_fingerprint);
        assert_eq!(pass_enc.sha256_checksum, fixture.passphrase_encrypt.sha256_checksum);

        let session_key = derive_session_key(PASS, &salt, PBKDF2_ITERATIONS);
        assert_eq!(
            compute_key_fingerprint(&session_key),
            fixture.session_key_fingerprint
        );
        let sess_enc = encrypt_with_key_nonce(plain, &session_key, &salt, &nonce).unwrap();
        assert_eq!(sess_enc.ciphertext, fixture.session_encrypt.ciphertext);
    }

    #[test]
    fn rust_decrypts_interop_fixture_payloads() {
        // These ciphertexts are the shared wire format. The Node script proves Web Crypto
        // produces the same bytes; this test proves Rust can still decrypt them.
        let fixture = load_interop_fixture();
        let plain = fixture.plaintext.as_bytes();

        assert_eq!(
            decrypt_bytes(&fixture.passphrase_encrypt, &fixture.passphrase).unwrap(),
            plain
        );

        let salt: [u8; SALT_LEN] = hex::decode(&fixture.salt_hex).unwrap().try_into().unwrap();
        let session_key = derive_session_key(PASS, &salt, PBKDF2_ITERATIONS);
        assert_eq!(
            decrypt_with_key(&fixture.session_encrypt, &session_key).unwrap(),
            plain
        );

        let verifier = PassphraseVerifier {
            iterations: fixture.verifier.iterations,
            salt: hex::decode(&fixture.verifier.salt).unwrap().try_into().unwrap(),
            hash: hex::decode(&fixture.verifier.hash).unwrap().try_into().unwrap(),
        };
        assert!(verify_passphrase(&verifier, PASS));
        assert!(!verify_passphrase(&verifier, "wrong passphrase"));
    }

    #[test]
    fn emit_interop_vectors_json() {
        // Regenerates fixture JSON for scripts/cross-crypto-roundtrip.mts.
        // Run: cargo test crypto::tests::emit_interop_vectors_json -- --nocapture
        let salt = interop_salt();
        let nonce = interop_nonce();
        let plain = b"cross-crypto hello";
        let passphrase_asset = encrypt_bytes_with(plain, PASS, &salt, &nonce).unwrap();

        let session_key = derive_session_key(PASS, &salt, PBKDF2_ITERATIONS);
        let session_asset = encrypt_with_key_nonce(plain, &session_key, &salt, &nonce).unwrap();

        let mut domain_salt = b"aethercloud-vault-verifier".to_vec();
        domain_salt.extend_from_slice(&salt);
        let verifier_hash = derive_key_with(PASS, &domain_salt, PBKDF2_ITERATIONS);

        let doc = serde_json::json!({
            "passphrase": PASS,
            "plaintext": "cross-crypto hello",
            "plaintextHex": hex::encode(plain),
            "saltHex": hex::encode(salt),
            "nonceHex": hex::encode(nonce),
            "pbkdf2Iterations": PBKDF2_ITERATIONS,
            "passphraseEncrypt": passphrase_asset,
            "sessionEncrypt": session_asset,
            "sessionKeyFingerprint": compute_key_fingerprint(&session_key),
            "verifier": {
                "iterations": PBKDF2_ITERATIONS,
                "salt": hex::encode(salt),
                "hash": hex::encode(verifier_hash),
            },
        });
        println!("{}", serde_json::to_string_pretty(&doc).unwrap());
    }
}
