import type { CloudAccount } from '../types';
import type { CloudProviderKind } from '../services/cloud';
import type { ProviderAccountInfo } from '../services/cloud/types';
import { accountIdForProvider, defaultEndpoint } from '../services/cloud';

const AVATAR_COLORS: Record<CloudProviderKind, string> = {
  'Google Drive': 'from-amber-500 to-emerald-500',
  Dropbox: 'from-blue-600 to-indigo-600',
  OneDrive: 'from-blue-500 to-sky-600',
  'MEGA Drive': 'from-red-500 to-rose-600',
  Nextcloud: 'from-blue-600 via-sky-500 to-cyan-400',
};

/** Sidebar account for a provider. Pass `info` after a live check, or omit it for an offline placeholder. */
export function buildCloudAccount(
  provider: CloudProviderKind,
  info: ProviderAccountInfo | null,
  endpoint?: string,
): CloudAccount {
  return {
    id: accountIdForProvider(provider),
    name: provider === 'Nextcloud' ? 'NextCloud' : provider,
    provider,
    email: info?.email ?? '',
    avatarColor: AVATAR_COLORS[provider],
    usedBytes: info?.usedBytes ?? 0,
    totalBytes: info?.totalBytes || 1,
    status: info ? 'connected' : 'offline',
    encryptionLevel: 'Standard TLS',
    liveConnected: info !== null,
    endpoint: endpoint || defaultEndpoint(provider),
  };
}
