import { CloudProviderId } from '../../types';
import { syncDropbox, testDropbox } from './adapters/dropbox';
import { syncGoogleDrive, testGoogleDrive } from './adapters/googleDrive';
import { syncMega, testMega } from './adapters/mega';
import { syncNextcloud, testNextcloud } from './adapters/nextcloud';
import { syncOneDrive, testOneDrive } from './adapters/oneDrive';
import { credentialStore } from './credentials';
import { mapRemoteEntries, MappedCloudLibrary } from './mapRemote';
import {
  accountIdForProvider,
  CloudProviderKind,
  defaultEndpoint,
  ProviderAccountInfo,
  ProviderCredentials,
  ProviderSyncResult,
} from './types';

export type { CloudProviderKind, ProviderCredentials, ProviderSyncResult } from './types';
export { accountIdForProvider, defaultEndpoint } from './types';
export { credentialStore } from './credentials';
export {
  credentialsFromGoogleTokens,
  googleOAuthClientId,
  isGoogleOAuthAvailable,
  isGoogleOAuthConfigured,
  signInWithGoogle,
} from './oauth/google';

async function testWith(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  switch (creds.provider) {
    case 'Google Drive':
      return testGoogleDrive(creds);
    case 'Dropbox':
      return testDropbox(creds);
    case 'OneDrive':
      return testOneDrive(creds);
    case 'MEGA Drive':
      return testMega(creds);
    case 'Nextcloud':
      return testNextcloud(creds);
  }
}

async function syncWith(creds: ProviderCredentials): Promise<ProviderSyncResult> {
  switch (creds.provider) {
    case 'Google Drive':
      return syncGoogleDrive(creds);
    case 'Dropbox':
      return syncDropbox(creds);
    case 'OneDrive':
      return syncOneDrive(creds);
    case 'MEGA Drive':
      return syncMega(creds);
    case 'Nextcloud':
      return syncNextcloud(creds);
  }
}

export const cloudService = {
  hasCredentials(accountId: CloudProviderId): boolean {
    return credentialStore.has(accountId);
  },

  getCredentials(accountId: CloudProviderId): ProviderCredentials | null {
    return credentialStore.get(accountId);
  },

  async testConnection(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
    return testWith(creds);
  },

  async connectAndSync(input: Omit<ProviderCredentials, 'updatedAt' | 'accountId'> & {
    accountId?: CloudProviderId;
  }): Promise<{
    accountId: CloudProviderId;
    info: ProviderAccountInfo;
    library: MappedCloudLibrary;
    note?: string;
  }> {
    const accountId = input.accountId || accountIdForProvider(input.provider);
    const creds: ProviderCredentials = {
      accountId,
      provider: input.provider,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      rcloneToken: input.rcloneToken,
      expiresAt: input.expiresAt,
      username: input.username,
      password: input.password,
      endpoint: input.endpoint || defaultEndpoint(input.provider),
      updatedAt: new Date().toISOString(),
    };

    const result = await syncWith(creds);
    // Prefer tokens refreshed mid-sync (Google) over the pre-sync snapshot.
    const after = credentialStore.get(accountId);
    await credentialStore.save({
      ...creds,
      accessToken: after?.accessToken ?? creds.accessToken,
      refreshToken: after?.refreshToken ?? creds.refreshToken,
      expiresAt: after?.expiresAt ?? creds.expiresAt,
    });
    const library = mapRemoteEntries(accountId, result.entries);

    const note = input.provider === 'MEGA Drive'
      ? 'MEGA login verified. Full encrypted file listing needs the MEGA client SDK.'
      : undefined;

    return { accountId, info: result.account, library, note };
  },

  async syncAccount(accountId: CloudProviderId): Promise<{
    info: ProviderAccountInfo;
    library: MappedCloudLibrary;
    note?: string;
  } | null> {
    const creds = credentialStore.get(accountId);
    if (!creds) return null;
    const result = await syncWith(creds);
    const library = mapRemoteEntries(accountId, result.entries);
    const note = creds.provider === 'MEGA Drive'
      ? 'MEGA login verified. Full encrypted file listing needs the MEGA client SDK.'
      : undefined;
    return { info: result.account, library, note };
  },

  async disconnect(accountId: CloudProviderId): Promise<void> {
    await credentialStore.remove(accountId);
  },

  /** Load credentials from the OS keychain (desktop) or localStorage (browser). */
  async hydrateCredentials(): Promise<void> {
    await credentialStore.hydrate();
  },

  providerKinds(): CloudProviderKind[] {
    return ['Google Drive', 'Dropbox', 'OneDrive', 'MEGA Drive', 'Nextcloud'];
  },
};
