/**
 * Helpers for encrypting / decrypting FileItem blob bytes with the vault session key.
 */

import { EncryptionInfo, FileItem } from '../types';
import { rustBridge, RustEncryptedAsset } from '../services/rustBridge';

const CIPHER_MIME = 'application/vnd.cloudbreak.aes-gcm';

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Fetch plaintext (or ciphertext) bytes from a FileItem URL. */
export async function readFileBytes(file: FileItem | File | Blob | string): Promise<Uint8Array> {
  if (typeof file === 'string') {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Could not read file (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
  if (file instanceof Blob) {
    return new Uint8Array(await file.arrayBuffer());
  }
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`Could not read “${file.name}” (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function revokeIfBlob(url: string | undefined): void {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

export function encryptionFromAsset(
  asset: RustEncryptedAsset,
  originalMimeType: string
): EncryptionInfo {
  return {
    isEncrypted: true,
    algorithm: 'AES-256-GCM',
    keyFingerprint: asset.keyFingerprint,
    checksumSha256: asset.sha256Checksum,
    encryptedAt: new Date().toISOString(),
    zeroKnowledgeVerified: true,
    nonce: asset.nonce,
    salt: asset.salt,
    originalMimeType,
  };
}

export function clearEncryption(checksumSha256: string): EncryptionInfo {
  return {
    isEncrypted: false,
    algorithm: 'None (local preview)',
    keyFingerprint: 'Not encrypted',
    checksumSha256,
    zeroKnowledgeVerified: false,
  };
}

/** True when the file has a real AES-GCM payload (not a sample/demo flag). */
export function hasEncryptedPayload(info: EncryptionInfo): boolean {
  return Boolean(info.isEncrypted && info.nonce && info.salt);
}

/**
 * Encrypt file bytes with the vault session key. Replaces `url` with a ciphertext blob.
 * Caller must ensure the vault is unlocked.
 */
export async function encryptFileItem(file: FileItem): Promise<FileItem> {
  const plain = await readFileBytes(file);
  const asset = await rustBridge.encryptWithSession(plain);
  const cipherBytes = hexToBytes(asset.ciphertext);
  const cipherUrl = URL.createObjectURL(
    new Blob([Uint8Array.from(cipherBytes)], { type: CIPHER_MIME })
  );

  revokeIfBlob(file.url);
  if (file.thumbnailUrl && file.thumbnailUrl !== file.url) {
    revokeIfBlob(file.thumbnailUrl);
  }

  return {
    ...file,
    url: cipherUrl,
    thumbnailUrl: undefined,
    documentBody: undefined,
    sizeBytes: cipherBytes.byteLength,
    updatedAt: new Date().toISOString(),
    encryption: encryptionFromAsset(asset, file.encryption.originalMimeType || file.mimeType),
  };
}

/**
 * Encrypt a freshly uploaded File. Returns ciphertext blob URL + encryption metadata.
 */
export async function encryptUploadBytes(
  data: Uint8Array,
  mimeType: string
): Promise<{ url: string; sizeBytes: number; encryption: EncryptionInfo }> {
  const asset = await rustBridge.encryptWithSession(data);
  const cipherBytes = hexToBytes(asset.ciphertext);
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(cipherBytes)], { type: CIPHER_MIME })
  );
  return {
    url,
    sizeBytes: cipherBytes.byteLength,
    encryption: encryptionFromAsset(asset, mimeType),
  };
}

/**
 * Decrypt a session-encrypted FileItem. Restores the original MIME and blob URL.
 */
export async function decryptFileItem(file: FileItem): Promise<FileItem> {
  const info = file.encryption;
  if (!hasEncryptedPayload(info) || !info.nonce || !info.salt) {
    throw new Error('This file has no encrypted payload to decrypt');
  }

  const cipherBytes = await readFileBytes(file);
  // Ciphertext on disk is raw AES-GCM bytes; EncryptionInfo also carries hex fields from encrypt.
  // Prefer reconstructing from stored hex when the blob might be stale; otherwise use blob bytes.
  let asset: Pick<RustEncryptedAsset, 'ciphertext' | 'nonce' | 'salt'>;
  if (info.nonce && info.salt) {
    // Re-hex the blob so decrypt_with_key gets matching ciphertext.
    const toHex = (bytes: Uint8Array) =>
      Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    asset = {
      ciphertext: toHex(cipherBytes),
      nonce: info.nonce,
      salt: info.salt,
    };
  } else {
    throw new Error('This file has no encrypted payload to decrypt');
  }

  const plain = await rustBridge.decryptWithSession(asset);
  const mime = info.originalMimeType || file.mimeType || 'application/octet-stream';
  const plainUrl = URL.createObjectURL(
    new Blob([Uint8Array.from(plain)], { type: mime })
  );

  revokeIfBlob(file.url);

  const isImage = mime.startsWith('image/');
  return {
    ...file,
    url: plainUrl,
    thumbnailUrl: isImage ? plainUrl : undefined,
    mimeType: mime,
    sizeBytes: plain.byteLength,
    updatedAt: new Date().toISOString(),
    encryption: clearEncryption(info.checksumSha256 || ''),
  };
}
