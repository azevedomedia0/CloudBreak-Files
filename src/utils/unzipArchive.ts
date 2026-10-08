import { unzipSync, strFromU8 } from 'fflate';
import { FileItem } from '../types';
import { computeSha256 } from './crypto';
import {
  classifyUploadCategory,
  isEditableDocument,
  isPlainTextDocument,
  TEXT_UPLOAD_MAX_BYTES,
} from './documentKind';

const ZIP_NAME = /\.zip$/i;

export function isZipArchive(file: Pick<FileItem, 'name' | 'mimeType'>): boolean {
  if (ZIP_NAME.test(file.name)) return true;
  return file.mimeType.toLowerCase() === 'application/zip'
    || file.mimeType.toLowerCase() === 'application/x-zip-compressed';
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

async function loadZipBytes(file: FileItem): Promise<Uint8Array> {
  if (!file.url || file.url === '#') {
    throw new Error('This archive has no downloadable bytes to extract.');
  }
  const response = await fetch(file.url);
  if (!response.ok) {
    throw new Error(`Could not read archive (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface UnzipResult {
  files: FileItem[];
  skippedDirectories: number;
  extractedCount: number;
}

/**
 * Extract a ZIP into FileItem records beside the archive (same folder / account).
 * Nested folders become path segments on folderPath; files get blob: URLs.
 */
export async function unzipArchiveToFileItems(archive: FileItem): Promise<UnzipResult> {
  const bytes = await loadZipBytes(archive);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('Could not unzip this file. It may be corrupt or password-protected.');
  }

  const stamp = Date.now();
  const extracted: FileItem[] = [];
  let skippedDirectories = 0;
  let index = 0;

  for (const [path, data] of Object.entries(entries)) {
    if (!path || path.endsWith('/')) {
      skippedDirectories += 1;
      continue;
    }
    // Skip macOS resource forks / junk
    if (path.startsWith('__MACOSX/') || path.split('/').pop()?.startsWith('._')) continue;

    const name = path.split('/').pop() || path;
    const mimeType = mimeFromName(name);
    const category = classifyUploadCategory(name, mimeType);
    const copy = new Uint8Array(data);
    const blob = new Blob([copy], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const parentSegments = path.split('/').slice(0, -1).filter(Boolean);
    const nestPath = parentSegments.length
      ? `${archive.folderPath.replace(/\/+$/, '')}/${parentSegments.join('/')}`
      : archive.folderPath;

    const probe = { name, mimeType, category };
    let documentBody: string | undefined;
    if (
      isEditableDocument(probe)
      && data.byteLength <= TEXT_UPLOAD_MAX_BYTES
      && (isPlainTextDocument(probe) || /\.html?$/i.test(name) || mimeType === 'text/html')
    ) {
      try {
        documentBody = strFromU8(data);
      } catch {
        documentBody = undefined;
      }
    }

    const checksum = data.byteLength > 100 * 1024 * 1024
      ? 'Not computed (file over 100 MB)'
      : await computeSha256(copy.buffer);

    extracted.push({
      id: `file-unzip-${stamp}-${index++}`,
      name,
      folderId: archive.folderId,
      folderPath: nestPath || '/',
      accountId: archive.accountId,
      sizeBytes: data.byteLength,
      category,
      mimeType,
      updatedAt: new Date().toISOString(),
      url: blobUrl,
      thumbnailUrl: category === 'photo' ? blobUrl : undefined,
      starred: false,
      tags: ['Extracted', 'Unzip'],
      documentBody,
      encryption: {
        isEncrypted: false,
        algorithm: 'None (extracted locally)',
        keyFingerprint: 'Not encrypted',
        checksumSha256: checksum,
        zeroKnowledgeVerified: false,
      },
      version: 1,
      sourceId: archive.sourceId,
    });
  }

  if (!extracted.length) {
    throw new Error('Archive is empty or only contains folders.');
  }

  return {
    files: extracted,
    skippedDirectories,
    extractedCount: extracted.length,
  };
}
