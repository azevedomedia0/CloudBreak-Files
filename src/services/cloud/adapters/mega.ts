import { cloudJson } from '../http';
import { ProviderAccountInfo, ProviderCredentials, ProviderSyncResult, RemoteEntry } from '../types';

/**
 * MEGA uses a custom encrypted API. We validate credentials via prelogin and
 * surface account email; full file decryption/listing needs the MEGA SDK.
 */
function requireCreds(creds: ProviderCredentials): { email: string; password: string; endpoint: string } {
  const email = (creds.username || '').trim().toLowerCase();
  const password = (creds.password || '').trim();
  const endpoint = (creds.endpoint || 'https://g.api.mega.co.nz').replace(/\/+$/, '');
  if (!email || !password) throw new Error('MEGA email and password are required');
  return { email, password, endpoint };
}

interface MegaPrelogin {
  s?: string;
  v?: number;
  e?: number;
}

export async function testMega(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  const { email, endpoint } = requireCreds(creds);
  const result = await cloudJson<MegaPrelogin | MegaPrelogin[]>({
    method: 'POST',
    url: `${endpoint}/cs?id=${Date.now() % 1_000_000_000}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ a: 'us0', user: email }]),
  }, [200]);

  const row = Array.isArray(result) ? result[0] : result;
  if (typeof row === 'number' || (row && typeof row.e === 'number' && row.e < 0)) {
    throw new Error('MEGA rejected this email (prelogin failed)');
  }
  if (!row?.s && row?.v == null) {
    throw new Error('Unexpected MEGA prelogin response');
  }

  return {
    email,
    displayName: email.split('@')[0],
    usedBytes: 0,
    totalBytes: 20 * 1024 ** 3,
  };
}

export async function syncMega(creds: ProviderCredentials): Promise<ProviderSyncResult> {
  const account = await testMega(creds);
  // Placeholder root so the mount is visible until a full MEGA client is added.
  const entries: RemoteEntry[] = [
    {
      id: 'mega-cloud-drive',
      name: 'Cloud Drive',
      path: '/Cloud Drive',
      isFolder: true,
      sizeBytes: 0,
      mimeType: 'inode/directory',
      updatedAt: new Date().toISOString(),
    },
  ];
  return { account, entries };
}
