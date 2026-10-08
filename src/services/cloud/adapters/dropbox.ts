import { cloudJson } from '../http';
import { ProviderAccountInfo, ProviderCredentials, ProviderSyncResult, RemoteEntry } from '../types';

interface DropboxAccount {
  email?: string;
  name?: { display_name?: string };
}

interface DropboxSpace {
  used?: number;
  allocation?: { allocated?: number };
}

interface DropboxEntry {
  '.tag': 'file' | 'folder' | string;
  id: string;
  name: string;
  path_display?: string;
  size?: number;
  client_modified?: string;
  server_modified?: string;
}

interface DropboxList {
  entries?: DropboxEntry[];
  cursor?: string;
  has_more?: boolean;
}

function requireToken(creds: ProviderCredentials): string {
  const token = creds.accessToken?.trim();
  if (!token) throw new Error('Dropbox access token is required');
  return token;
}

function apiBase(creds: ProviderCredentials): string {
  return (creds.endpoint || 'https://api.dropboxapi.com/2').replace(/\/+$/, '');
}

export async function testDropbox(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  const token = requireToken(creds);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const account = await cloudJson<DropboxAccount>({
    method: 'POST',
    url: `${apiBase(creds)}/users/get_current_account`,
    headers,
    body: 'null',
  });
  const space = await cloudJson<DropboxSpace>({
    method: 'POST',
    url: `${apiBase(creds)}/users/get_space_usage`,
    headers,
    body: 'null',
  });
  return {
    email: account.email || 'unknown@dropbox',
    displayName: account.name?.display_name,
    usedBytes: space.used || 0,
    totalBytes: space.allocation?.allocated || 2 * 1024 ** 3,
  };
}

export async function syncDropbox(creds: ProviderCredentials): Promise<ProviderSyncResult> {
  const token = requireToken(creds);
  const account = await testDropbox(creds);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const entries: RemoteEntry[] = [];

  let list = await cloudJson<DropboxList>({
    method: 'POST',
    url: `${apiBase(creds)}/files/list_folder`,
    headers,
    body: JSON.stringify({ path: '', recursive: true, limit: 200 }),
  });

  const ingest = (batch: DropboxEntry[] | undefined) => {
    for (const item of batch || []) {
      const isFolder = item['.tag'] === 'folder';
      const path = item.path_display || `/${item.name}`;
      entries.push({
        id: `db-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        name: item.name,
        path,
        isFolder,
        sizeBytes: item.size || 0,
        mimeType: isFolder ? 'inode/directory' : 'application/octet-stream',
        updatedAt: item.server_modified || item.client_modified || new Date().toISOString(),
      });
    }
  };

  ingest(list.entries);
  while (list.has_more && list.cursor && entries.length < 400) {
    list = await cloudJson<DropboxList>({
      method: 'POST',
      url: `${apiBase(creds)}/files/list_folder/continue`,
      headers,
      body: JSON.stringify({ cursor: list.cursor }),
    });
    ingest(list.entries);
  }

  return { account, entries };
}
