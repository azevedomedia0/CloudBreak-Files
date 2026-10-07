/**
 * Rust Native Backend & Tauri IPC Bridge
 * Calls the native Rust commands inside Tauri. In a plain browser, it uses
 * Web Crypto with the same data format, so both paths read each other's output.
 *
 * Format: PBKDF2-HMAC-SHA256 (600,000 iterations, 16-byte salt) -> AES-256-GCM
 * (12-byte nonce). Ciphertext, nonce and salt are hex strings.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface RustEncryptedAsset {
  ciphertext: string;
  nonce: string;
  salt: string;
  keyFingerprint: string;
  sha256Checksum: string;
}

export interface RustStorageStats {
  totalUsed: number;
  totalQuota: number;
  activeNodes: number;
}

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

// Keep in sync with PBKDF2_ITERATIONS in src-tauri/src/crypto.rs.
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSPHRASE_LEN = 8;
const VERIFIER_DOMAIN = 'aethercloud-vault-verifier';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const asBuffer = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

function assertPassphrase(passphrase: string | undefined): asserts passphrase is string {
  if (!passphrase || [...passphrase].length < MIN_PASSPHRASE_LEN) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LEN} characters`);
  }
}

async function deriveKeyBytes(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    256
  );
  return new Uint8Array(bits);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', asBuffer(data))));
}

async function aesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBuffer(raw), { name: 'AES-GCM' }, false, [usage]);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class RustBridgeService {
  // Browser-mode vault state. The first unlock after page load sets the passphrase.
  private webVerifier: { salt: Uint8Array; hash: string } | null = null;
  private webUnlocked = false;

  private getInvoke(): InvokeFn | null {
    return isTauri() ? (invoke as InvokeFn) : null;
  }

  private isTauriAvailable(): boolean {
    return this.getInvoke() !== null;
  }

  public getBackendEngineName(): 'Rust (Tauri Native)' | 'Rust WebCore Engine' {
    return this.isTauriAvailable() ? 'Rust (Tauri Native)' : 'Rust WebCore Engine';
  }

  public async computeSha256(content: string): Promise<string> {
    const invoke = this.getInvoke();
    if (invoke) {
      return (await invoke('compute_sha256_checksum', { content })) as string;
    }
    return sha256Hex(new TextEncoder().encode(content));
  }

  /** Encrypt text with AES-256-GCM. A passphrase of 8 or more characters is required. */
  public async encryptData(plaintext: string, passphrase: string): Promise<RustEncryptedAsset> {
    assertPassphrase(passphrase);

    const invoke = this.getInvoke();
    if (invoke) {
      return (await invoke('encrypt_data', { req: { plaintext, passphrase } })) as RustEncryptedAsset;
    }

    const data = new TextEncoder().encode(plaintext);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const keyBytes = await deriveKeyBytes(passphrase, salt);
    const key = await aesKey(keyBytes, 'encrypt');
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(nonce) }, key, asBuffer(data))
    );
    const fingerprint = (await sha256Hex(keyBytes)).slice(0, 16).match(/.{2}/g)!.join(':');
    keyBytes.fill(0); // best effort: do not keep raw key bytes around

    return {
      ciphertext: toHex(cipher),
      nonce: toHex(nonce),
      salt: toHex(salt),
      keyFingerprint: fingerprint,
      sha256Checksum: await sha256Hex(data),
    };
  }

  /** Decrypt data from `encryptData`. It throws if the passphrase is wrong or the data changed. */
  public async decryptData(
    asset: Pick<RustEncryptedAsset, 'ciphertext' | 'nonce' | 'salt'>,
    passphrase: string
  ): Promise<string> {
    assertPassphrase(passphrase);

    const invoke = this.getInvoke();
    if (invoke) {
      return (await invoke('decrypt_data', {
        req: { ciphertext: asset.ciphertext, nonce: asset.nonce, salt: asset.salt, passphrase },
      })) as string;
    }

    const nonce = fromHex(asset.nonce);
    if (nonce.length !== 12) throw new Error('Invalid nonce length');
    const keyBytes = await deriveKeyBytes(passphrase, fromHex(asset.salt));
    const key = await aesKey(keyBytes, 'decrypt');
    keyBytes.fill(0);
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asBuffer(nonce) },
        key,
        asBuffer(fromHex(asset.ciphertext))
      );
      return new TextDecoder('utf-8', { fatal: true }).decode(plain);
    } catch {
      throw new Error('Decryption failed - invalid key or corrupted payload');
    }
  }

  /** Unlock the vault. The first unlock after launch sets the passphrase. Later unlocks must match it. */
  public async unlockVault(passphrase: string): Promise<void> {
    assertPassphrase(passphrase);

    const invoke = this.getInvoke();
    if (invoke) {
      await invoke('unlock_sovereign_vault', { passphrase });
      return;
    }

    const verifierHash = async (salt: Uint8Array) => {
      const domain = new TextEncoder().encode(VERIFIER_DOMAIN);
      const domainSalt = new Uint8Array(domain.length + salt.length);
      domainSalt.set(domain, 0);
      domainSalt.set(salt, domain.length);
      return toHex(await deriveKeyBytes(passphrase, domainSalt));
    };

    if (!this.webVerifier) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      this.webVerifier = { salt, hash: await verifierHash(salt) };
    } else if (!constantTimeEqual(await verifierHash(this.webVerifier.salt), this.webVerifier.hash)) {
      throw new Error('Incorrect passphrase');
    }
    this.webUnlocked = true;
  }

  public async lockVault(): Promise<void> {
    const invoke = this.getInvoke();
    if (invoke) {
      await invoke('lock_sovereign_vault');
      return;
    }
    this.webUnlocked = false;
  }

  public async isVaultUnlocked(): Promise<boolean> {
    const invoke = this.getInvoke();
    if (invoke) return (await invoke('check_vault_status')) as boolean;
    return this.webUnlocked;
  }
}

export const rustBridge = new RustBridgeService();
