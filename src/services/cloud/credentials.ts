import { CloudProviderId } from '../../types';
import { ProviderCredentials } from './types';

const STORAGE_KEY = 'cloudbreak.providerCredentials.v1';

function readAll(): Record<string, ProviderCredentials> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ProviderCredentials>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ProviderCredentials>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export const credentialStore = {
  get(accountId: CloudProviderId): ProviderCredentials | null {
    return readAll()[accountId] ?? null;
  },

  list(): ProviderCredentials[] {
    return Object.values(readAll());
  },

  save(creds: ProviderCredentials): void {
    const map = readAll();
    map[creds.accountId] = { ...creds, updatedAt: new Date().toISOString() };
    writeAll(map);
  },

  remove(accountId: CloudProviderId): void {
    const map = readAll();
    delete map[accountId];
    writeAll(map);
  },

  has(accountId: CloudProviderId): boolean {
    return !!readAll()[accountId];
  },
};
