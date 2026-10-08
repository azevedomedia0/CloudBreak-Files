import { cloudJson, cloudRequest } from '../http';
import { ProviderAccountInfo, ProviderCredentials, ProviderSyncResult, RemoteEntry } from '../types';

interface DriveAbout {
  user?: { emailAddress?: string; displayName?: string };
  storageQuota?: { usage?: string; limit?: string };
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  parents?: string[];
}

interface DriveList {
  files?: DriveFile[];
  nextPageToken?: string;
}

function requireToken(creds: ProviderCredentials): string {
  const token = creds.accessToken?.trim();
  if (!token) throw new Error('Google Drive access token is required');
  return token;
}

function base(creds: ProviderCredentials): string {
  return (creds.endpoint || 'https://www.googleapis.com/drive/v3').replace(/\/+$/, '');
}

export async function testGoogleDrive(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  const token = requireToken(creds);
  const about = await cloudJson<DriveAbout>({
    method: 'GET',
    url: `${base(creds)}/about?fields=user,storageQuota`,
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    email: about.user?.emailAddress || 'unknown@drive',
    displayName: about.user?.displayName,
    usedBytes: Number(about.storageQuota?.usage || 0),
    totalBytes: Number(about.storageQuota?.limit || 0) || 15 * 1024 ** 3,
  };
}

export async function syncGoogleDrive(creds: ProviderCredentials): Promise<ProviderSyncResult> {
  const token = requireToken(creds);
  const account = await testGoogleDrive(creds);
  const entries: RemoteEntry[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: '100',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webContentLink,thumbnailLink,parents)',
      q: 'trashed=false',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await cloudJson<DriveList>({
      method: 'GET',
      url: `${base(creds)}/files?${params}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    for (const file of page.files || []) {
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
      entries.push({
        id: `gd-${file.id}`,
        name: file.name,
        path: `/${file.name}`,
        isFolder,
        sizeBytes: Number(file.size || 0),
        mimeType: isFolder ? 'inode/directory' : file.mimeType,
        updatedAt: file.modifiedTime || new Date().toISOString(),
        downloadUrl: file.webContentLink,
        thumbnailUrl: file.thumbnailLink,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && entries.length < 400);

  // Touch token once more so failed auth surfaces even on empty drives.
  await cloudRequest({
    method: 'GET',
    url: `${base(creds)}/about?fields=user`,
    headers: { Authorization: `Bearer ${token}` },
  });

  return { account, entries };
}
