/**
 * Client-Side End-to-End Encryption (E2EE) Module
 * Built using the standard Web Cryptography API (SubtleCrypto)
 * Provides AES-GCM-256 encryption, PBKDF2 key derivation, and SHA-256 hashing.
 */

// Keep in sync with PBKDF2_ITERATIONS in src-tauri/src/crypto.rs.
const PBKDF2_ITERATIONS = 600_000;
const HASH_ALGO = 'SHA-256';

// Derive an AES-GCM 256 key from a user passphrase and salt
export async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the raw key bytes can never be read back
    ['encrypt', 'decrypt']
  );
}

// Generate a random master key
export async function generateMasterKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Base64 in chunks. Spreading a large array into String.fromCharCode overflows the call stack.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

// Encrypt plaintext or bytes using AES-GCM
export async function encryptData(
  data: ArrayBuffer | string,
  key: CryptoKey
): Promise<{ cipherBuffer: ArrayBuffer; iv: Uint8Array; base64: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  let buffer: ArrayBuffer;

  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else {
    buffer = data;
  }

  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    buffer
  );

  // Combine IV (12 bytes) + cipherBuffer for base64 transport
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

  const base64 = bytesToBase64(combined);
  return { cipherBuffer, iv, base64 };
}

// Decrypt AES-GCM data
export async function decryptData(
  cipherBuffer: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  return await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    cipherBuffer
  );
}

// Compute SHA-256 fingerprint/checksum of any string or buffer
export async function computeSha256(data: string | ArrayBuffer): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else {
    buffer = data;
  }

  const hashBuffer = await window.crypto.subtle.digest(HASH_ALGO, buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Format a cryptographic fingerprint with colons (e.g., 7a:e9:12:...)
export function formatFingerprint(hash: string): string {
  const chunks = hash.slice(0, 32).match(/.{1,2}/g) || [];
  return chunks.join(':');
}

// Deterministic mock helper for generating consistent mock keys when vault is locked/unlocked
export function generateMockKeyFingerprint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `0x${hex.slice(0, 4)}:${hex.slice(4, 8)}:E2EE:AES256`;
}
