/**
 * Spotlight “Search This Mac” (desktop macOS only).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { FileItem } from '../types';
import { localFs } from './localFsBridge';
import { classifyUploadCategory, fileExtension, needsNativeThumbnail } from '../utils/documentKind';

export interface SystemSearchHit {
  name: string;
  path: string;
  parentPath: string;
  sizeBytes: number;
  modifiedMs: number;
  isDir: boolean;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pages: 'application/vnd.apple.pages',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg',
  txt: 'text/plain', md: 'text/markdown', html: 'text/html',
};

function guessMime(name: string): string {
  return MIME_BY_EXTENSION[fileExtension(name)] || 'application/octet-stream';
}

export function hitToFileItem(hit: SystemSearchHit): FileItem {
  const isApp = hit.name.toLowerCase().endsWith('.app');
  const mimeType = isApp
    ? 'application/x-apple-app'
    : hit.isDir
    ? 'inode/directory'
    : guessMime(hit.name);
  const category = hit.isDir && !isApp ? 'document' : classifyUploadCategory(hit.name, mimeType);
  const url = hit.isDir && !isApp ? '#' : isApp ? '#' : localFs.assetUrl(hit.path);
  const parentName = hit.parentPath.split('/').filter(Boolean).pop() || hit.parentPath || 'This Mac';

  return {
    id: `file-system-search-${hit.path}`,
    name: hit.name,
    folderPath: hit.parentPath || `/${parentName}`,
    accountId: 'all',
    sizeBytes: hit.sizeBytes,
    category,
    mimeType,
    updatedAt: new Date(hit.modifiedMs || Date.now()).toISOString(),
    addedAt: new Date().toISOString(),
    url,
    thumbnailUrl: category === 'photo' && !needsNativeThumbnail({ name: hit.name, mimeType, category })
      ? url
      : undefined,
    starred: false,
    tags: isApp ? ['System Search', 'Application', parentName] : ['System Search', parentName],
    localPath: hit.isDir && !isApp ? undefined : hit.path,
    encryption: {
      isEncrypted: false,
      algorithm: 'None (system search)',
      keyFingerprint: 'Not encrypted',
      checksumSha256: 'Not computed (system search)',
      zeroKnowledgeVerified: false,
    },
    version: 1,
    photoExif: category === 'photo' ? { camera: 'This Mac', colorSpace: 'sRGB' } : undefined,
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
  };
}

export const systemSearchBridge = {
  available(): boolean {
    return isTauri();
  },

  search(query: string): Promise<SystemSearchHit[]> {
    return invoke<SystemSearchHit[]>('system_search', { query });
  },

  clear(): Promise<void> {
    return invoke<void>('system_search_clear');
  },
};

/** Merge library hits with Spotlight hits; library entries win on the same path. */
export function mergeSystemSearchResults(library: FileItem[], system: FileItem[]): FileItem[] {
  const libraryPaths = new Set(
    library.map(f => f.localPath).filter((p): p is string => !!p),
  );
  const extras = system.filter(f => !f.localPath || !libraryPaths.has(f.localPath));
  return [...library, ...extras];
}
