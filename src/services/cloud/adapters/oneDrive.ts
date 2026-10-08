import { cloudJson } from '../http';
import { ProviderAccountInfo, ProviderCredentials, ProviderSyncResult, RemoteEntry } from '../types';

interface GraphDrive {
  owner?: { user?: { email?: string; displayName?: string } };
  quota?: { used?: number; total?: number };
}

interface GraphItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: Record<string, unknown>;
  file?: { mimeType?: string };
  '@microsoft.graph.downloadUrl'?: string;
  thumbnails?: Array<{ medium?: { url?: string } }>;
  parentReference?: { path?: string };
}

interface GraphList {
  value?: GraphItem[];
  '@odata.nextLink'?: string;
}

function requireToken(creds: ProviderCredentials): string {
  const token = creds.accessToken?.trim();
  if (!token) throw new Error('OneDrive (Microsoft Graph) access token is required');
  return token;
}

function graphBase(creds: ProviderCredentials): string {
  return (creds.endpoint || 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '');
}

export async function testOneDrive(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  const token = requireToken(creds);
  const drive = await cloudJson<GraphDrive>({
    method: 'GET',
    url: `${graphBase(creds)}/me/drive`,
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    email: drive.owner?.user?.email || 'unknown@onedrive',
    displayName: drive.owner?.user?.displayName,
    usedBytes: drive.quota?.used || 0,
    totalBytes: drive.quota?.total || 5 * 1024 ** 3,
  };
}

export async function syncOneDrive(creds: ProviderCredentials): Promise<ProviderSyncResult> {
  const token = requireToken(creds);
  const account = await testOneDrive(creds);
  const entries: RemoteEntry[] = [];
  let url: string | undefined =
    `${graphBase(creds)}/me/drive/root/children?$top=100&$expand=thumbnails`;

  while (url && entries.length < 400) {
    const page: GraphList = await cloudJson<GraphList>({
      method: 'GET',
      url,
      headers: { Authorization: `Bearer ${token}` },
    });

    for (const item of page.value || []) {
      const isFolder = !!item.folder;
      const parentPath = (item.parentReference?.path || '/drive/root:').replace(/^\/drive\/root:?/, '') || '';
      const path = `${parentPath}/${item.name}`.replace(/\/+/g, '/') || `/${item.name}`;
      entries.push({
        id: `od-${item.id}`,
        name: item.name,
        path,
        isFolder,
        sizeBytes: item.size || 0,
        mimeType: isFolder ? 'inode/directory' : (item.file?.mimeType || 'application/octet-stream'),
        updatedAt: item.lastModifiedDateTime || new Date().toISOString(),
        downloadUrl: item['@microsoft.graph.downloadUrl'],
        thumbnailUrl: item.thumbnails?.[0]?.medium?.url,
      });
    }
    url = page['@odata.nextLink'];
  }

  return { account, entries };
}
