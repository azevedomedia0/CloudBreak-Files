//! Library / file key material and wrapping (X25519 ECDH or passphrase).

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

pub const ROOT_KEY_LEN: usize = 32;
pub const FILE_KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const WRAP_SALT_LEN: usize = 16;

#[derive(Debug, thiserror::Error)]
pub enum KeyError {
    #[error("encryption failed")]
    Encrypt,
    #[error("decryption failed")]
    Decrypt,
    #[error("invalid key material")]
    Invalid,
    #[error("hex error")]
    Hex(#[from] hex::FromHexError),
}

#[derive(Clone)]
pub struct LibraryRootKey(pub [u8; ROOT_KEY_LEN]);

impl LibraryRootKey {
    pub fn random() -> Self {
        let mut key = [0u8; ROOT_KEY_LEN];
        rand::thread_rng().fill_bytes(&mut key);
        Self(key)
    }

    pub fn from_hex(hex_str: &str) -> Result<Self, KeyError> {
        let bytes = hex::decode(hex_str)?;
        let arr: [u8; ROOT_KEY_LEN] = bytes.try_into().map_err(|_| KeyError::Invalid)?;
        Ok(Self(arr))
    }

    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }

    pub fn derive_file_key(&self, file_id: &str) -> [u8; FILE_KEY_LEN] {
        let hk = Hkdf::<Sha256>::new(Some(b"aether-file-key-v1"), &self.0);
        let mut out = [0u8; FILE_KEY_LEN];
        hk.expand(file_id.as_bytes(), &mut out)
            .expect("HKDF expand");
        out
    }
}

impl Drop for LibraryRootKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

/// AES-256-GCM encrypt with a raw 32-byte key (library/file keys).
pub fn aead_encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<(Vec<u8>, [u8; NONCE_LEN]), KeyError> {
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| KeyError::Encrypt)?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| KeyError::Encrypt)?;
    Ok((ct, nonce))
}

pub fn aead_decrypt(key: &[u8; 32], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, KeyError> {
    if nonce.len() != NONCE_LEN {
        return Err(KeyError::Invalid);
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| KeyError::Decrypt)?;
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| KeyError::Decrypt)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedLibraryKey {
    pub scheme: String,
    /// Ephemeral X25519 public key (hex), when scheme = "x25519-hkdf-aesgcm".
    pub eph_public_hex: Option<String>,
    pub nonce_hex: String,
    pub ciphertext_hex: String,
    /// Salt for passphrase wrap.
    pub salt_hex: Option<String>,
}

/// Wrap library root key to a recipient X25519 public key.
pub fn wrap_for_peer(root: &LibraryRootKey, recipient_x25519_hex: &str) -> Result<WrappedLibraryKey, KeyError> {
    let recip_bytes = hex::decode(recipient_x25519_hex)?;
    let recip_arr: [u8; 32] = recip_bytes.try_into().map_err(|_| KeyError::Invalid)?;
    let recipient = PublicKey::from(recip_arr);

    let eph_secret = StaticSecret::random_from_rng(rand::thread_rng());
    let eph_public = PublicKey::from(&eph_secret);
    let shared = eph_secret.diffie_hellman(&recipient);

    let hk = Hkdf::<Sha256>::new(Some(b"aether-wrap-v1"), shared.as_bytes());
    let mut wrap_key = [0u8; 32];
    hk.expand(b"library-root", &mut wrap_key)
        .map_err(|_| KeyError::Encrypt)?;

    let (ct, nonce) = aead_encrypt(&wrap_key, &root.0)?;
    wrap_key.zeroize();

    Ok(WrappedLibraryKey {
        scheme: "x25519-hkdf-aesgcm".into(),
        eph_public_hex: Some(hex::encode(eph_public.as_bytes())),
        nonce_hex: hex::encode(nonce),
        ciphertext_hex: hex::encode(ct),
        salt_hex: None,
    })
}

pub fn unwrap_for_peer(
    wrapped: &WrappedLibraryKey,
    recipient_secret: &StaticSecret,
) -> Result<LibraryRootKey, KeyError> {
    if wrapped.scheme != "x25519-hkdf-aesgcm" {
        return Err(KeyError::Invalid);
    }
    let eph_hex = wrapped.eph_public_hex.as_ref().ok_or(KeyError::Invalid)?;
    let eph_bytes = hex::decode(eph_hex)?;
    let eph_arr: [u8; 32] = eph_bytes.try_into().map_err(|_| KeyError::Invalid)?;
    let eph_public = PublicKey::from(eph_arr);
    let shared = recipient_secret.diffie_hellman(&eph_public);

    let hk = Hkdf::<Sha256>::new(Some(b"aether-wrap-v1"), shared.as_bytes());
    let mut wrap_key = [0u8; 32];
    hk.expand(b"library-root", &mut wrap_key)
        .map_err(|_| KeyError::Decrypt)?;

    let nonce = hex::decode(&wrapped.nonce_hex)?;
    let ct = hex::decode(&wrapped.ciphertext_hex)?;
    let plain = aead_decrypt(&wrap_key, &nonce, &ct)?;
    wrap_key.zeroize();
    let arr: [u8; ROOT_KEY_LEN] = plain.try_into().map_err(|_| KeyError::Invalid)?;
    Ok(LibraryRootKey(arr))
}

/// Passphrase-wrapped key (invite secret), PBKDF2 + AES-GCM.
pub fn wrap_with_passphrase(root: &LibraryRootKey, passphrase: &str) -> Result<WrappedLibraryKey, KeyError> {
    let mut salt = [0u8; WRAP_SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let key = crate::crypto::derive_key(passphrase, &salt);
    let (ct, nonce) = aead_encrypt(&key, &root.0)?;
    Ok(WrappedLibraryKey {
        scheme: "passphrase-pbkdf2-aesgcm".into(),
        eph_public_hex: None,
        nonce_hex: hex::encode(nonce),
        ciphertext_hex: hex::encode(ct),
        salt_hex: Some(hex::encode(salt)),
    })
}

pub fn unwrap_with_passphrase(wrapped: &WrappedLibraryKey, passphrase: &str) -> Result<LibraryRootKey, KeyError> {
    if wrapped.scheme != "passphrase-pbkdf2-aesgcm" {
        return Err(KeyError::Invalid);
    }
    let salt_hex = wrapped.salt_hex.as_ref().ok_or(KeyError::Invalid)?;
    let salt = hex::decode(salt_hex)?;
    let key = crate::crypto::derive_key(passphrase, &salt);
    let nonce = hex::decode(&wrapped.nonce_hex)?;
    let ct = hex::decode(&wrapped.ciphertext_hex)?;
    let plain = aead_decrypt(&key, &nonce, &ct)?;
    let arr: [u8; ROOT_KEY_LEN] = plain.try_into().map_err(|_| KeyError::Invalid)?;
    Ok(LibraryRootKey(arr))
}

#[cfg(test)]
mod tests {
    use super::*;
    use x25519_dalek::PublicKey;

    #[test]
    fn peer_wrap_roundtrip() {
        let root = LibraryRootKey::random();
        let secret = StaticSecret::random_from_rng(rand::thread_rng());
        let public = PublicKey::from(&secret);
        let wrapped = wrap_for_peer(&root, &hex::encode(public.as_bytes())).unwrap();
        let unwrapped = unwrap_for_peer(&wrapped, &secret).unwrap();
        assert_eq!(root.0, unwrapped.0);
    }

    #[test]
    fn passphrase_wrap_roundtrip() {
        let root = LibraryRootKey::random();
        let wrapped = wrap_with_passphrase(&root, "correct horse battery").unwrap();
        let unwrapped = unwrap_with_passphrase(&wrapped, "correct horse battery").unwrap();
        assert_eq!(root.0, unwrapped.0);
        assert!(unwrap_with_passphrase(&wrapped, "wrong passphrase!!").is_err());
    }
}
