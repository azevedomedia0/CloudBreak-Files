/**
 * Rust Native Backend & Tauri IPC Bridge
 * Calls the native Rust commands inside Tauri. In a plain browser, it uses
 * Web Crypto with the same data format, so both paths read each other's output.
 *
 * Format: PBKDF2-HMAC-SHA256 (600,000 iterations, 16-byte salt) -> AES-256-GCM
 * (12-byte nonce). Ciphertext, nonce and salt are hex strings.
 *
 * File encryption uses a session key derived on vault unlock and held in Rust
 * (or a non-extractable CryptoKey in browser mode). The passphrase is not kept in JS.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  loadBrowserVerifier,
  saveBrowserVerifier,
  type StoredPassphraseVerifier,
} from './browserVaultStore';

export interface RustEncryptedAsset {
  ciphertext: string;
  nonce: string;
  salt: string;
  keyFingerprint: string;
  sha256Checksum: string;
}

/** Path-based streaming vault encrypt (desktop). No 32 MB / base64 IPC limit. */
export interface RustStreamEncryptResult {
  outputPath: string;
  salt: string;
  keyFingerprint: string;
  sha256Checksum: string;
  sizeBytes: number;
  chunkCount: number;
  algorithm: string;
}

export interface RustStorageStats {
  totalUsed: number;
  totalQuota: number;
  activeNodes: number;
}

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

// Keep in sync with PBKDF2_ITERATIONS / MAX_SESSION_BYTES in src-tauri/src/crypto.rs.
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSPHRASE_LEN = 8;
const MAX_SESSION_BYTES = 32 * 1024 * 1024;
const VERIFIER_DOMAIN = 'aethercloud-vault-verifier';
const SESSION_KEY_DOMAIN = 'aethercloud-file-session';

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

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function assertPassphrase(passphrase: string | undefined): asserts passphrase is string {
  if (!passphrase || [...passphrase].length < MIN_PASSPHRASE_LEN) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LEN} characters`);
  }
}

function assertSessionSize(byteLength: number): void {
  if (byteLength > MAX_SESSION_BYTES) {
    throw new Error(
      `File is too large to encrypt in-session (max ${MAX_SESSION_BYTES / (1024 * 1024)} MB)`
    );
  }
}

async function deriveKeyBytes(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error('Invalid PBKDF2 iteration count');
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    256
  );
  return new Uint8Array(bits);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', asBuffer(data))));
}

function fingerprintFromKeyBytes(keyBytes: Uint8Array): Promise<string> {
  return sha256Hex(keyBytes).then(hash => hash.slice(0, 16).match(/.{2}/g)!.join(':'));
}

async function aesKey(raw: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBuffer(raw), { name: 'AES-GCM' }, false, usage);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function domainSalt(domain: string, salt: Uint8Array): Uint8Array {
  const domainBytes = new TextEncoder().encode(domain);
  const out = new Uint8Array(domainBytes.length + salt.length);
  out.set(domainBytes, 0);
  out.set(salt, domainBytes.length);
  return out;
}

class RustBridgeService {
  /**
   * Browser-mode vault verifier (salted hash only). Loaded from localStorage on demand
   * so the passphrase check survives reload. Session key is still memory-only.
   */
  private webVerifier: { salt: Uint8Array; hash: string; iterations: number } | null = null;
  private webVerifierLoaded = false;
  private webUnlocked = false;
  /** Non-extractable AES-GCM key held only while the vault is unlocked (browser mode). */
  private webSessionKey: CryptoKey | null = null;
  private webSessionFingerprint: string | null = null;

  private getInvoke(): InvokeFn | null {
    return isTauri() ? (invoke as InvokeFn) : null;
  }

  private isTauriAvailable(): boolean {
    return this.getInvoke() !== null;
  }

  public getBackendEngineName(): 'Rust (Tauri Native)' | 'Rust WebCore Engine' {
    return this.isTauriAvailable() ? 'Rust (Tauri Native)' : 'Rust WebCore Engine';
  }

  public getMaxSessionBytes(): number {
    return MAX_SESSION_BYTES;
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
    const key = await aesKey(keyBytes, ['encrypt']);
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(nonce) }, key, asBuffer(data))
    );
    const fingerprint = await fingerprintFromKeyBytes(keyBytes);
    keyBytes.fill(0);

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
    const key = await aesKey(keyBytes, ['decrypt']);
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

  /**
   * Encrypt file bytes with the vault session key. Requires an unlocked vault.
   * The passphrase is never passed here — the key lives in Rust (or a non-extractable
   * CryptoKey in browser mode).
   */
  public async encryptWithSession(data: Uint8Array): Promise<RustEncryptedAsset> {
    assertSessionSize(data.byteLength);

    const invoke = this.getInvoke();
    if (invoke) {
      return (await invoke('encrypt_session_data', {
        req: { plaintextBase64: bytesToBase64(data) },
      })) as RustEncryptedAsset;
    }

    if (!this.webUnlocked || !this.webSessionKey) {
      throw new Error('Vault is locked — unlock to encrypt files');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: asBuffer(nonce) },
        this.webSessionKey,
        asBuffer(data)
      )
    );

    return {
      ciphertext: toHex(cipher),
      nonce: toHex(nonce),
      salt: toHex(salt),
      keyFingerprint: this.webSessionFingerprint ?? 'unknown',
      sha256Checksum: await sha256Hex(data),
    };
  }

  /**
   * Stream-encrypt a local file on disk (desktop). Use for files over 32 MB or to avoid base64 IPC.
   */
  public async encryptSessionFile(
    path: string,
    outputPath?: string,
  ): Promise<RustStreamEncryptResult> {
    const invoke = this.getInvoke();
    if (!invoke) {
      throw new Error('Streaming file encryption requires the desktop app');
    }
    return (await invoke('encrypt_session_file', {
      req: { path, outputPath: outputPath ?? null },
    })) as RustStreamEncryptResult;
  }

  /** Stream-decrypt a CBSTRM01 vault file to an allowed local path (desktop). */
  public async decryptSessionFile(
    path: string,
    outputPath: string,
  ): Promise<RustStreamEncryptResult> {
    const invoke = this.getInvoke();
    if (!invoke) {
      throw new Error('Streaming file decryption requires the desktop app');
    }
    return (await invoke('decrypt_session_file', {
      req: { path, outputPath },
    })) as RustStreamEncryptResult;
  }

  /** Decrypt file bytes produced by `encryptWithSession`. Requires an unlocked vault. */
  public async decryptWithSession(
    asset: Pick<RustEncryptedAsset, 'ciphertext' | 'nonce' | 'salt'>
  ): Promise<Uint8Array> {
    const invoke = this.getInvoke();
    if (invoke) {
      const b64 = (await invoke('decrypt_session_data', {
        req: {
          ciphertext: asset.ciphertext,
          nonce: asset.nonce,
          salt: asset.salt,
        },
      })) as string;
      return base64ToBytes(b64);
    }

    if (!this.webUnlocked || !this.webSessionKey) {
      throw new Error('Vault is locked — unlock to decrypt files');
    }

    const nonce = fromHex(asset.nonce);
    if (nonce.length !== 12) throw new Error('Invalid nonce length');
    const ciphertext = fromHex(asset.ciphertext);
    assertSessionSize(ciphertext.byteLength);

    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asBuffer(nonce) },
        this.webSessionKey,
        asBuffer(ciphertext)
      );
      return new Uint8Array(plain);
    } catch {
      throw new Error('Decryption failed - invalid key or corrupted payload');
    }
  }

  private async establishWebSession(
    passphrase: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<void> {
    const keyBytes = await deriveKeyBytes(
      passphrase,
      domainSalt(SESSION_KEY_DOMAIN, salt),
      iterations
    );
    this.webSessionFingerprint = await fingerprintFromKeyBytes(keyBytes);
    this.webSessionKey = await aesKey(keyBytes, ['encrypt', 'decrypt']);
    keyBytes.fill(0);
  }

  private clearWebSession(): void {
    this.webSessionKey = null;
    this.webSessionFingerprint = null;
    this.webUnlocked = false;
  }

  /** Load verifier from localStorage once (browser mode only). */
  private ensureWebVerifierLoaded(): void {
    if (this.webVerifierLoaded) return;
    this.webVerifierLoaded = true;
    const stored = loadBrowserVerifier();
    if (!stored) return;
    this.webVerifier = {
      salt: fromHex(stored.salt),
      hash: stored.hash.toLowerCase(),
      iterations: stored.iterations,
    };
  }

  private persistWebVerifier(): void {
    if (!this.webVerifier) return;
    const record: StoredPassphraseVerifier = {
      iterations: this.webVerifier.iterations,
      salt: toHex(this.webVerifier.salt),
      hash: this.webVerifier.hash,
    };
    saveBrowserVerifier(record);
  }

  /** True when a vault passphrase has been set (browser: localStorage; Tauri: always unknown → false). */
  public hasVaultConfigured(): boolean {
    if (this.isTauriAvailable()) return false;
    try {
      this.ensureWebVerifierLoaded();
      return this.webVerifier !== null;
    } catch {
      return true; // corrupt store still means a vault was configured
    }
  }

  /** True once a vault passphrase exists, so the UI can offer "create" or "unlock". */
  public async isVaultConfigured(): Promise<boolean> {
    const invokeFn = this.getInvoke();
    if (invokeFn) {
      try {
        return (await invokeFn('vault_is_configured')) as boolean;
      } catch {
        return true; // an unreadable vault file still means one was set up
      }
    }
    return this.hasVaultConfigured();
  }

  /** Unlock the vault. The first unlock after launch sets the passphrase. Later unlocks must match it. */
  public async unlockVault(passphrase: string): Promise<void> {
    assertPassphrase(passphrase);

    const invokeFn = this.getInvoke();
    if (invokeFn) {
      await invokeFn('unlock_sovereign_vault', { passphrase });
      return;
    }

    this.ensureWebVerifierLoaded();

    const verifierHash = async (salt: Uint8Array, iterations: number) =>
      toHex(await deriveKeyBytes(passphrase, domainSalt(VERIFIER_DOMAIN, salt), iterations));

    if (!this.webVerifier) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iterations = PBKDF2_ITERATIONS;
      const hash = await verifierHash(salt, iterations);
      this.webVerifier = { salt, hash, iterations };
      // Persist before marking unlocked so a crash never unlocks without a stored verifier.
      this.persistWebVerifier();
    } else {
      const candidate = await verifierHash(this.webVerifier.salt, this.webVerifier.iterations);
      if (!constantTimeEqual(candidate, this.webVerifier.hash)) {
        throw new Error('Incorrect passphrase');
      }
    }

    await this.establishWebSession(
      passphrase,
      this.webVerifier.salt,
      this.webVerifier.iterations
    );
    this.webUnlocked = true;
  }

  public async lockVault(): Promise<void> {
    const invokeFn = this.getInvoke();
    if (invokeFn) {
      await invokeFn('lock_sovereign_vault');
      return;
    }
    this.clearWebSession();
  }

  public async isVaultUnlocked(): Promise<boolean> {
    const invokeFn = this.getInvoke();
    if (invokeFn) return (await invokeFn('check_vault_status')) as boolean;
    return this.webUnlocked;
  }

  /** Test helper: drop in-memory browser vault state (simulates a page reload). */
  public resetBrowserVaultMemoryForTests(): void {
    this.webVerifier = null;
    this.webVerifierLoaded = false;
    this.clearWebSession();
  }
}

export const rustBridge = new RustBridgeService();
