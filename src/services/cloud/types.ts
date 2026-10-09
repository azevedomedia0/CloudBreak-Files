import { CloudProviderId, FileCategory } from '../../types';

export type CloudProviderKind =
  | 'Google Drive'
  | 'Dropbox'
  | 'OneDrive'
  | 'MEGA Drive'
  | 'Nextcloud';

export interface ProviderCredentials {
  accountId: CloudProviderId;
  provider: CloudProviderKind;
  /** OAuth / API bearer token (Drive, Dropbox, OneDrive). */
  accessToken?: string;
  /** Nextcloud / MEGA username or email. */
  username?: string;
  /** Nextcloud app password or MEGA password. */
  password?: string;
  /** Base API or WebDAV endpoint. */
  endpoint?: string;
  updatedAt: string;
}

export interface RemoteEntry {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  sizeBytes: number;
  mimeType: string;
  updatedAt: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
}

export interface ProviderAccountInfo {
  email: string;
  displayName?: string;
  usedBytes: number;
  totalBytes: number;
}

export interface ProviderSyncResult {
  account: ProviderAccountInfo;
  entries: RemoteEntry[];
}

export interface CloudHttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface CloudHttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export function guessCategory(mimeType: string, name: string): FileCategory {
  const mime = mimeType.toLowerCase();
  const lower = name.toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|raw|dng|cr2|nef|arw)$/i.test(lower)) return 'photo';
  if (mime.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/i.test(lower)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|flac|aac|m4a|aiff)$/i.test(lower)) return 'audio';
  if (
    mime.includes('pdf')
    || mime.includes('document')
    || mime.includes('sheet')
    || mime.includes('presentation')
    || mime.includes('text')
    || /\.(pdf|docx?|txt|md|rtf|pages|odt|xlsx?|pptx?|numbers|key|csf)$/i.test(lower)
  ) {
    return 'document';
  }
  return 'archive';
}

/** Canonical account slot for each provider in the sidebar. */
export function accountIdForProvider(provider: CloudProviderKind): CloudProviderId {
  switch (provider) {
    case 'Google Drive':
      return 'gdrive';
    case 'Dropbox':
      return 'dropbox';
    case 'OneDrive':
      return 's3';
    case 'MEGA Drive':
      return 'cloudflare_r2';
    case 'Nextcloud':
      return 'nextcloud';
  }
}

export function defaultEndpoint(provider: CloudProviderKind): string {
  switch (provider) {
    case 'Google Drive':
      return 'https://www.googleapis.com/drive/v3';
    case 'Dropbox':
      return 'https://api.dropboxapi.com/2';
    case 'OneDrive':
      return 'https://graph.microsoft.com/v1.0';
    case 'MEGA Drive':
      return 'https://g.api.mega.co.nz';
    case 'Nextcloud':
      return 'https://cloud.example.org/remote.php/dav/files/USERNAME';
  }
}
