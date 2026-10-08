use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// OWASP recommendation for PBKDF2-HMAC-SHA256. Keep in sync with `src/services/rustBridge.ts`.
pub const PBKDF2_ITERATIONS: u32 = 600_000;
const KEY_LEN: usize = 32; // 256 bits
const NONCE_LEN: usize = 12; // 96 bits
const SALT_LEN: usize = 16; // 128 bits
pub const MIN_PASSPHRASE_LEN: usize = 8;

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

/// Encrypt plaintext with AES-256-GCM and return structured payload
pub fn encrypt_bytes(data: &[u8], passphrase: &str) -> Result<EncryptedAsset, CryptoError> {
    validate_passphrase(passphrase)?;
    let mut rng = rand::thread_rng();
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill_bytes(&mut salt);
    rng.fill_bytes(&mut nonce_bytes);

    let key = derive_key(passphrase, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| CryptoError::EncryptionFailure)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|_| CryptoError::EncryptionFailure)?;

    let sha256_checksum = compute_sha256(data);
    let key_fingerprint = compute_key_fingerprint(&key);

    Ok(EncryptedAsset {
        ciphertext: hex::encode(ciphertext),
        nonce: hex::encode(nonce_bytes),
        salt: hex::encode(salt),
        key_fingerprint,
        sha256_checksum,
    })
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
}
