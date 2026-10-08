import { CloudProviderId, FileItem, FolderItem } from '../../types';
import { guessCategory, RemoteEntry } from './types';

export interface MappedCloudLibrary {
  folders: FolderItem[];
  files: FileItem[];
}

/** Convert a flat remote listing into app FolderItem / FileItem records. */
export function mapRemoteEntries(
  accountId: CloudProviderId,
  entries: RemoteEntry[],
): MappedCloudLibrary {
  const folders: FolderItem[] = [];
  const files: FileItem[] = [];
  const folderIdByPath = new Map<string, string>();

  const ensureFolder = (path: string, name: string, remoteId?: string): string => {
    const normalized = path.replace(/\/+$/, '') || '/';
    const existing = folderIdByPath.get(normalized);
    if (existing) return existing;
    const id = remoteId || `${accountId}-folder-${btoa(normalized).replace(/=+/g, '').slice(0, 40)}`;
    folderIdByPath.set(normalized, id);
    const parentPath = normalized.split('/').slice(0, -1).join('/') || '';
    const parentId = parentPath && parentPath !== normalized
      ? ensureFolder(parentPath, parentPath.split('/').filter(Boolean).pop() || 'Root')
      : undefined;
    folders.push({
      id,
      name,
      accountId,
      parentId,
      itemCount: 0,
    });
    return id;
  };

  for (const entry of entries) {
    if (entry.isFolder) {
      ensureFolder(entry.path, entry.name, entry.id);
    }
  }

  for (const entry of entries) {
    if (entry.isFolder) continue;
    const parentPath = entry.path.split('/').slice(0, -1).join('/') || '/';
    const folderId = parentPath && parentPath !== '/'
      ? ensureFolder(parentPath, parentPath.split('/').filter(Boolean).pop() || 'Root')
      : undefined;
    const category = guessCategory(entry.mimeType, entry.name);
    files.push({
      id: entry.id,
      name: entry.name,
      folderId,
      folderPath: parentPath || '/',
      accountId,
      sizeBytes: entry.sizeBytes,
      category,
      mimeType: entry.mimeType || 'application/octet-stream',
      updatedAt: entry.updatedAt,
      thumbnailUrl: entry.thumbnailUrl,
      url: entry.downloadUrl || entry.thumbnailUrl || '',
      starred: false,
      tags: ['Live sync'],
      encryption: {
        isEncrypted: false,
        algorithm: 'TLS in transit',
        keyFingerprint: 'Provider-managed',
        checksumSha256: 'pending',
        zeroKnowledgeVerified: false,
      },
      version: 1,
    });
  }

  for (const folder of folders) {
    folder.itemCount = files.filter(f => f.folderId === folder.id).length
      + folders.filter(f => f.parentId === folder.id).length;
  }

  return { folders, files };
}
