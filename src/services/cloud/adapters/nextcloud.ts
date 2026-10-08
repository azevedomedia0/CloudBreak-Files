import { cloudRequest } from '../http';
import { ProviderAccountInfo, ProviderCredentials, ProviderSyncResult, RemoteEntry } from '../types';

function requireCreds(creds: ProviderCredentials): { user: string; pass: string; endpoint: string } {
  const user = creds.username?.trim();
  const pass = creds.password?.trim();
  const endpoint = (creds.endpoint || '').trim().replace(/\/+$/, '');
  if (!user || !pass) throw new Error('Nextcloud username and app password are required');
  if (!endpoint) throw new Error('Nextcloud WebDAV endpoint is required');
  return { user, pass, endpoint };
}

function authHeader(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

function parsePropfind(xml: string, basePath: string): RemoteEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
  const entries: RemoteEntry[] = [];

  for (const node of responses) {
    const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
    if (!href) continue;
    let decoded = decodeURIComponent(href);
    // Skip the collection root itself.
    const normalizedBase = basePath.replace(/\/+$/, '');
    const pathOnly = decoded.replace(/^https?:\/\/[^/]+/i, '');
    if (pathOnly.replace(/\/+$/, '') === normalizedBase.replace(/\/+$/, '')) continue;

    const name = pathOnly.split('/').filter(Boolean).pop() || 'Untitled';
    const isFolder = node.getElementsByTagNameNS('DAV:', 'collection').length > 0
      || /\/$/.test(pathOnly);
    const getcontentlength = node.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent;
    const getcontenttype = node.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent;
    const getlastmodified = node.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent;
    const idSource = pathOnly || name;

    entries.push({
      id: `nc-${btoa(idSource).replace(/=+/g, '').slice(0, 48)}`,
      name,
      path: pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`,
      isFolder,
      sizeBytes: Number(getcontentlength || 0),
      mimeType: isFolder ? 'inode/directory' : (getcontenttype || 'application/octet-stream'),
      updatedAt: getlastmodified ? new Date(getlastmodified).toISOString() : new Date().toISOString(),
      downloadUrl: decoded.startsWith('http') ? decoded : undefined,
    });
  }

  return entries;
}

export async function testNextcloud(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  const { user, pass, endpoint } = requireCreds(creds);
  const res = await cloudRequest({
    method: 'PROPFIND',
    url: endpoint,
    headers: {
      Authorization: authHeader(user, pass),
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:displayname/></d:prop>
</d:propfind>`,
  });
  if (res.status !== 207 && res.status !== 200) {
    throw new Error(`Nextcloud WebDAV auth failed (${res.status})`);
  }
  return {
    email: user.includes('@') ? user : `${user}@nextcloud`,
    displayName: user,
    usedBytes: 0,
    totalBytes: 0,
  };
}

export async function syncNextcloud(creds: ProviderCredentials): Promise<ProviderSyncResult> {
  const { user, pass, endpoint } = requireCreds(creds);
  const account = await testNextcloud(creds);
  const urlPath = new URL(endpoint).pathname;
  const res = await cloudRequest({
    method: 'PROPFIND',
    url: endpoint,
    headers: {
      Authorization: authHeader(user, pass),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`,
  });
  if (res.status !== 207 && res.status !== 200) {
    throw new Error(`Nextcloud list failed (${res.status})`);
  }
  return {
    account,
    entries: parsePropfind(res.body, urlPath),
  };
}
