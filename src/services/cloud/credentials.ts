/**
 * Cloud provider credentials.
 *
 * Desktop (Tauri): OS keychain via Rust (`credentials_store.rs`) — macOS Keychain,
 * Windows Credential Manager, Linux Secret Service.
 * Browser preview: localStorage (same shape; not for production secrets).
 *
 * Sync getters read an in-memory cache hydrated once at launch (`hydrate`).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { CloudProviderId } from '../../types';
import { ProviderCredentials } from './types';

const STORAGE_KEY = 'cloudbreak.providerCredentials.v1';

let memory = new Map<string, ProviderCredentials>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function readLegacyLocal(): Record<string, ProviderCredentials> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ProviderCredentials>;
  } catch {
    return {};
  }
}

function clearLegacyLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function writeLegacyLocal(map: Record<string, ProviderCredentials>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function memoryToRecord(): Record<string, ProviderCredentials> {
  const out: Record<string, ProviderCredentials> = {};
  for (const [id, creds] of memory) out[id] = creds;
  return out;
}

async function keychainList(): Promise<ProviderCredentials[]> {
  return invoke<ProviderCredentials[]>('credentials_list');
}

async function keychainSave(creds: ProviderCredentials): Promise<void> {
  await invoke('credentials_save', { creds });
}

async function keychainRemove(accountId: string): Promise<void> {
  await invoke('credentials_remove', { accountId });
}

async function keychainImportMap(map: Record<string, ProviderCredentials>): Promise<number> {
  return invoke<number>('credentials_import_map', { map });
}

async function keychainAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>('credentials_keychain_available');
  } catch {
    return false;
  }
}

/**
 * Load credentials into memory. On desktop, prefers the OS keychain and migrates
 * any leftover localStorage entries once, then clears them.
 */
async function doHydrate(): Promise<void> {
  if (isTauri()) {
    const available = await keychainAvailable();
    if (available) {
      const listed = await keychainList().catch(() => [] as ProviderCredentials[]);
      memory = new Map(listed.map(c => [c.accountId, c]));

      const legacy = readLegacyLocal();
      const legacyIds = Object.keys(legacy);
      if (legacyIds.length) {
        try {
          await keychainImportMap(legacy);
          const refreshed = await keychainList();
          memory = new Map(refreshed.map(c => [c.accountId, c]));
          clearLegacyLocal();
        } catch {
          // Keep legacy in memory for this session if migration fails.
          for (const creds of Object.values(legacy)) {
            memory.set(creds.accountId, creds);
          }
        }
      }
      hydrated = true;
      return;
    }
  }

  // Browser, or keychain unavailable — localStorage only.
  const legacy = readLegacyLocal();
  memory = new Map(Object.entries(legacy).map(([id, c]) => [id, c]));
  hydrated = true;
}

export const credentialStore = {
  /** Ensure the in-memory cache is loaded (safe to call multiple times). */
  hydrate(): Promise<void> {
    if (hydrated) return Promise.resolve();
    if (!hydratePromise) {
      hydratePromise = doHydrate().finally(() => {
        hydratePromise = null;
      });
    }
    return hydratePromise;
  },

  /** True when running against the OS keychain (desktop). */
  usesKeychain(): boolean {
    return isTauri();
  },

  get(accountId: CloudProviderId): ProviderCredentials | null {
    return memory.get(accountId) ?? null;
  },

  list(): ProviderCredentials[] {
    return [...memory.values()];
  },

  async save(creds: ProviderCredentials): Promise<void> {
    await this.hydrate();
    const next: ProviderCredentials = {
      ...creds,
      updatedAt: new Date().toISOString(),
    };
    memory.set(next.accountId, next);

    if (isTauri()) {
      try {
        await keychainSave(next);
        // Drop any leftover plaintext copy so secrets are not in two places.
        const legacy = readLegacyLocal();
        if (legacy[next.accountId]) {
          delete legacy[next.accountId];
          if (Object.keys(legacy).length) writeLegacyLocal(legacy);
          else clearLegacyLocal();
        }
        return;
      } catch (err) {
        // Fall through to localStorage so the user is not locked out.
        console.warn('Keychain save failed; falling back to localStorage', err);
      }
    }

    writeLegacyLocal(memoryToRecord());
  },

  async remove(accountId: CloudProviderId): Promise<void> {
    await this.hydrate();
    memory.delete(accountId);

    if (isTauri()) {
      try {
        await keychainRemove(accountId);
      } catch (err) {
        console.warn('Keychain remove failed', err);
      }
    }

    const legacy = readLegacyLocal();
    if (legacy[accountId]) {
      delete legacy[accountId];
      if (Object.keys(legacy).length) writeLegacyLocal(legacy);
      else clearLegacyLocal();
    } else if (!isTauri()) {
      writeLegacyLocal(memoryToRecord());
    }
  },

  has(accountId: CloudProviderId): boolean {
    return memory.has(accountId);
  },
};
