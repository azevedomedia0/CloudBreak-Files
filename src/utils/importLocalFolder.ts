import { FileItem, FolderItem } from '../types';
import { localFs, type LocalEntry, type LocalFolder } from '../services/localFsBridge';
import {
  classifyUploadCategory,
  isEditableDocument,
  fileExtension,
  isPlainTextDocument,
  TEXT_UPLOAD_MAX_BYTES,
} from './documentKind';

const MAX_DEPTH = 6;
const MAX_FILES = 400;

type DirHandle = {
  kind: 'directory';
  name: string;
  entries: () => AsyncIterableIterator<[string, { kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File>; entries?: () => AsyncIterableIterator<[string, unknown]> }]>;
};

export type LocalFolderImport = {
  rootFolder: FolderItem;
  folders: FolderItem[];
  files: FileItem[];
  /** True when the folder had more items than the scan limit and the rest were skipped. */
  truncated?: boolean;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', heic: 'image/heic', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
  pdf: 'application/pdf', zip: 'application/zip', json: 'application/json',
  html: 'text/html', htm: 'text/html', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', svg: 'image/svg+xml',
};

function guessMime(name: string): string {
  return MIME_BY_EXTENSION[fileExtension(name)] ?? '';
}

/** Merge into an existing list, replacing items that have the same id (so adding a folder twice is harmless). */
export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const ids = new Set(incoming.map(item => item.id));
  return [...incoming, ...existing.filter(item => !ids.has(item.id))];
}

function folderPathFor(rootName: string, relativeSegments: string[]): string {
  if (!relativeSegments.length) return `/${rootName}`;
  return `/${rootName}/${relativeSegments.join('/')}`;
}

async function fileToItem(
  file: File,
  opts: { folderId: string; folderPath: string; stamp: number; index: number },
): Promise<FileItem> {
  const mimeType = file.type || 'application/octet-stream';
  const category = classifyUploadCategory(file.name, mimeType);
  const blobUrl = URL.createObjectURL(file);
  const probe = { name: file.name, mimeType, category };

  let documentBody: string | undefined;
  if (
    isEditableDocument(probe)
    && file.size <= TEXT_UPLOAD_MAX_BYTES
    && (isPlainTextDocument(probe) || /\.html?$/i.test(file.name) || mimeType === 'text/html')
  ) {
    try {
      documentBody = await file.text();
    } catch {
      documentBody = undefined;
    }
  }

  return {
    id: `file-local-${opts.stamp}-${opts.index}`,
    name: file.name,
    folderId: opts.folderId,
    folderPath: opts.folderPath,
    accountId: 'all',
    sizeBytes: file.size,
    category,
    mimeType,
    updatedAt: new Date(file.lastModified || Date.now()).toISOString(),
    url: blobUrl,
    thumbnailUrl: category === 'photo' ? blobUrl : undefined,
    starred: false,
    tags: ['Local Files', 'Imported'],
    documentBody,
    encryption: {
      isEncrypted: false,
      algorithm: 'None (local folder)',
      keyFingerprint: 'Not encrypted',
      checksumSha256: 'Not computed (folder import)',
      zeroKnowledgeVerified: false,
    },
    version: 1,
    videoMeta: category === 'video'
      ? {
          durationSeconds: 0,
          dimensions: { width: 1920, height: 1080 },
          framerate: 30,
          codec: 'Unknown',
          bitrate: '—',
          audioCodec: '—',
        }
      : undefined,
    photoExif: category === 'photo'
      ? { camera: 'Local disk', colorSpace: 'sRGB' }
      : undefined,
  };
}

async function walkDirectory(
  dir: DirHandle,
  opts: {
    parentFolderId: string;
    rootName: string;
    relativeSegments: string[];
    depth: number;
    stamp: number;
    folders: FolderItem[];
    files: FileItem[];
    fileIndex: { n: number };
  },
): Promise<void> {
  if (opts.depth > MAX_DEPTH || opts.fileIndex.n >= MAX_FILES) return;

  for await (const [, entry] of dir.entries()) {
    if (opts.fileIndex.n >= MAX_FILES) break;
    if (entry.name.startsWith('.')) continue;

    if (entry.kind === 'directory' && entry.entries) {
      const folderId = `folder-local-${opts.stamp}-${opts.folders.length}`;
      const segments = [...opts.relativeSegments, entry.name];
      opts.folders.push({
        id: folderId,
        name: entry.name,
        accountId: 'all',
        parentId: opts.parentFolderId,
        itemCount: 0,
        color: 'sky',
      });
      await walkDirectory(entry as DirHandle, {
        ...opts,
        parentFolderId: folderId,
        relativeSegments: segments,
        depth: opts.depth + 1,
      });
      continue;
    }

    if (entry.kind === 'file' && entry.getFile) {
      try {
        const file = await entry.getFile();
        const item = await fileToItem(file, {
          folderId: opts.parentFolderId,
          folderPath: folderPathFor(opts.rootName, opts.relativeSegments),
          stamp: opts.stamp,
          index: opts.fileIndex.n++,
        });
        opts.files.push(item);
      } catch {
        // Skip unreadable entries (permission, aliases, etc.)
      }
    }
  }
}

function recountFolderItems(folders: FolderItem[], files: FileItem[]): void {
  const byParent = new Map<string, number>();
  for (const f of files) {
    if (!f.folderId) continue;
    byParent.set(f.folderId, (byParent.get(f.folderId) ?? 0) + 1);
  }
  for (const folder of folders) {
    const childFolders = folders.filter(f => f.parentId === folder.id).length;
    folder.itemCount = (byParent.get(folder.id) ?? 0) + childFolders;
  }
}

async function diskEntryToItem(entry: LocalEntry, folderId: string, folderPath: string): Promise<FileItem> {
  const mimeType = guessMime(entry.name) || 'application/octet-stream';
  const category = classifyUploadCategory(entry.name, mimeType);
  const url = localFs.assetUrl(entry.path);
  const probe = { name: entry.name, mimeType, category };

  let documentBody: string | undefined;
  if (
    isEditableDocument(probe)
    && entry.sizeBytes <= TEXT_UPLOAD_MAX_BYTES
    && (isPlainTextDocument(probe) || /\.html?$/i.test(entry.name))
  ) {
    try {
      documentBody = await localFs.readText(entry.path);
    } catch {
      documentBody = undefined;
    }
  }

  return {
    id: `file-local-${entry.path}`,
    name: entry.name,
    folderId,
    folderPath,
    accountId: 'all',
    sizeBytes: entry.sizeBytes,
    category,
    mimeType,
    updatedAt: new Date(entry.modifiedMs || Date.now()).toISOString(),
    url,
    thumbnailUrl: category === 'photo' ? url : undefined,
    starred: false,
    tags: ['Local Files'],
    documentBody,
    localPath: entry.path,
    encryption: {
      isEncrypted: false,
      algorithm: 'None (local folder)',
      keyFingerprint: 'Not encrypted',
      checksumSha256: 'Not computed (local folder)',
      zeroKnowledgeVerified: false,
    },
    version: 1,
    videoMeta: category === 'video'
      ? {
          durationSeconds: 0,
          dimensions: { width: 1920, height: 1080 },
          framerate: 30,
          codec: 'Unknown',
          bitrate: '—',
          audioCodec: '—',
        }
      : undefined,
    photoExif: category === 'photo'
      ? { camera: 'Local disk', colorSpace: 'sRGB' }
      : undefined,
  };
}

export type ImportLocalFolderOptions = {
  /** Override the root folder id (used for stable Desktop / Documents / … entries). */
  rootId?: string;
  /** Override the sidebar display name (e.g. Pictures → Photos). */
  displayName?: string;
};

/** Scan a folder the user added in the desktop app and build the sidebar folders and file list. */
export async function importLocalFolderAtPath(
  folder: LocalFolder,
  options: ImportLocalFolderOptions = {},
): Promise<LocalFolderImport> {
  const scan = await localFs.scanFolder(folder.path);
  const displayName = options.displayName ?? folder.name;
  const rootId = options.rootId ?? `folder-local-${folder.path}`;
  const rootFolder: FolderItem = { id: rootId, name: displayName, accountId: 'all', itemCount: 0, color: 'sky' };
  const folders: FolderItem[] = [rootFolder];
  const folderIds = new Map<string, string>([['', rootId]]);
  const pending: Array<{ entry: LocalEntry; folderId: string; folderPath: string }> = [];

  // Entries arrive folder-first, so a parent is always known before its children.
  for (const entry of scan.entries) {
    const cut = entry.relativePath.lastIndexOf('/');
    const parentRel = cut >= 0 ? entry.relativePath.slice(0, cut) : '';
    const parentId = folderIds.get(parentRel) ?? rootId;
    if (entry.isDir) {
      const id = `folder-local-${entry.path}`;
      folders.push({ id, name: entry.name, accountId: 'all', parentId, itemCount: 0, color: 'sky' });
      folderIds.set(entry.relativePath, id);
    } else {
      pending.push({
        entry,
        folderId: parentId,
        folderPath: folderPathFor(displayName, parentRel ? parentRel.split('/') : []),
      });
    }
  }

  const files: FileItem[] = [];
  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16);
    files.push(...await Promise.all(batch.map(p => diskEntryToItem(p.entry, p.folderId, p.folderPath))));
  }

  recountFolderItems(folders, files);
  return { rootFolder, folders, files, truncated: scan.truncated };
}

/** Open the system folder picker and import the tree into Local Files. */
export async function pickLocalFolderFromDisk(): Promise<LocalFolderImport | null> {
  if (localFs.available()) {
    const picked = await localFs.pickFolder();
    return picked ? importLocalFolderAtPath(picked) : null;
  }

  const showDirectoryPicker = (window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;
  }).showDirectoryPicker;

  if (!showDirectoryPicker) {
    throw new Error('Folder picking isn’t available in this browser. Try Chrome, Edge, or the desktop app.');
  }

  let rootHandle: DirHandle;
  try {
    rootHandle = await showDirectoryPicker({ mode: 'read' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    throw err;
  }

  const stamp = Date.now();
  const rootId = `folder-local-${stamp}-0`;
  const rootFolder: FolderItem = {
    id: rootId,
    name: rootHandle.name,
    accountId: 'all',
    itemCount: 0,
    color: 'sky',
  };

  const folders: FolderItem[] = [rootFolder];
  const files: FileItem[] = [];
  const fileIndex = { n: 0 };

  await walkDirectory(rootHandle, {
    parentFolderId: rootId,
    rootName: rootHandle.name,
    relativeSegments: [],
    depth: 0,
    stamp,
    folders,
    files,
    fileIndex,
  });

  recountFolderItems(folders, files);

  return { rootFolder, folders, files };
}
