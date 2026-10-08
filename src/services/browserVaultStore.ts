/**
 * Browser-mode vault verifier persistence (localStorage).
 * Mirrors src-tauri/src/vault_store.rs: salted hash only, never the passphrase or session key.
 * Format matches Rust vault.json so the fields stay interchangeable.
 */

const STORAGE_KEY = 'cloudbreak.vault.verifier';

/** Same shape as Rust `PassphraseVerifier` JSON (camelCase not used — Rust uses snake-free field names). */
export interface StoredPassphraseVerifier {
  iterations: number;
  salt: string; // hex, 16 bytes
  hash: string; // hex, 32 bytes
}

const HEX16 = /^[0-9a-f]{32}$/i;
const HEX32 = /^[0-9a-f]{64}$/i;

function isValidVerifier(value: unknown): value is StoredPassphraseVerifier {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.iterations === 'number'
    && Number.isInteger(v.iterations)
    && v.iterations > 0
    && typeof v.salt === 'string'
    && HEX16.test(v.salt)
    && typeof v.hash === 'string'
    && HEX32.test(v.hash)
  );
}

/**
 * Load the persisted verifier. Returns null when none exists yet.
 * A corrupt entry is an error (never silently replaced), matching Rust vault_store.
 */
export function loadBrowserVerifier(): StoredPassphraseVerifier | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error('Could not read the vault verifier from browser storage');
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Vault verifier in browser storage is corrupted. Clear site data for this origin to reset the vault.'
    );
  }
  if (!isValidVerifier(parsed)) {
    throw new Error(
      'Vault verifier in browser storage is corrupted. Clear site data for this origin to reset the vault.'
    );
  }
  return parsed;
}

/** Persist the verifier. Overwrites any previous entry. */
export function saveBrowserVerifier(verifier: StoredPassphraseVerifier): void {
  if (!isValidVerifier(verifier)) {
    throw new Error('Refusing to save an invalid vault verifier');
  }
  if (typeof localStorage === 'undefined') {
    throw new Error('Browser storage is not available');
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(verifier));
  } catch (err) {
    throw new Error(
      `Could not save the vault verifier: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Remove the persisted verifier (tests / explicit reset only). */
export function clearBrowserVerifier(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function browserVaultStorageKey(): string {
  return STORAGE_KEY;
}
