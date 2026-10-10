export type CloudProviderId = 'all' | 'gdrive' | 'dropbox' | 's3' | 'cloudflare_r2' | 'onedrive' | 'mega' | 'nextcloud' | 'vault';

export interface CloudAccount {
  id: CloudProviderId;
  name: string;
  provider: 'Google Drive' | 'Dropbox' | 'AWS S3' | 'Cloudflare R2' | 'OneDrive' | 'MEGA Drive' | 'Nextcloud' | 'Encrypted Vault' | string;
  email: string;
  avatarColor: string;
  usedBytes: number;
  totalBytes: number;
  status: 'connected' | 'syncing' | 'offline';
  encryptionLevel: 'Standard TLS' | 'Client E2EE AES-256' | 'Zero-Knowledge Vault';
  isVault?: boolean;
  /** True when credentials were verified against the live provider API. */
  liveConnected?: boolean;
  /** Provider API / WebDAV endpoint used for live sync. */
  endpoint?: string;
}

/** File kinds, plus toolbar presets (`files` = all items grouped by local folder). */
export type FileCategory = 'all' | 'files' | 'photo' | 'video' | 'document' | 'audio' | 'archive';

export interface PhotoExifData {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  dimensions?: { width: number; height: number };
  colorSpace?: string;
}

export interface VideoMetadata {
  durationSeconds: number;
  dimensions: { width: number; height: number };
  framerate: number;
  codec: string;
  bitrate: string;
  audioCodec: string;
}

export interface EncryptionInfo {
  isEncrypted: boolean;
  algorithm: string; // e.g. 'AES-256-GCM' or 'AES-256-GCM-STREAM'
  keyFingerprint: string;
  checksumSha256: string;
  encryptedAt?: string;
  zeroKnowledgeVerified: boolean;
  /** AES-GCM nonce (hex) when bytes were encrypted with the vault session key. */
  nonce?: string;
  /** Per-file salt (hex); unused for session-key derivation, kept for format parity. */
  salt?: string;
  /** MIME type of the plaintext before encryption (restored on decrypt). */
  originalMimeType?: string;
  /** Desktop streaming cipher path (CBSTRM01). Present when algorithm is AES-256-GCM-STREAM. */
  streamCipherPath?: string;
  /** Original plaintext path before streaming encrypt (for restore on decrypt). */
  streamPlainPath?: string;
}

export interface FileItem {
  id: string;
  name: string;
  folderId?: string;
  folderPath: string;
  accountId: CloudProviderId;
  sizeBytes: number;
  category: FileCategory;
  mimeType: string;
  updatedAt: string;
  /** When the item was first added to Cloudbreak (ISO). Used for “Date Added” sort. */
  addedAt?: string;
  /** When the user last opened/selected the item (ISO). Used for “Date Last Opened” sort. */
  lastOpenedAt?: string;
  thumbnailUrl?: string;
  url: string;
  starred?: boolean;
  tags: string[];
  encryption: EncryptionInfo;
  photoExif?: PhotoExifData;
  videoMeta?: VideoMetadata;
  sharedWith?: string[];
  version: number;
  /** Set for files that live on a network share (its name) or a removable device (its id) instead of a cloud account. */
  sourceId?: string;
  /** Plain text, or HTML for a rich document, edited in the document editor. */
  documentBody?: string;
  /** Absolute path on disk, for files added from a local folder in the desktop app. Edits are saved here. */
  localPath?: string;
  /**
   * Trust metadata for data extracted from the file.
   * All extracted content is untrusted external data; suspicious payloads need a user verdict.
   */
  contentSafety?: {
    risk: 'none' | 'low' | 'medium' | 'high';
    flags: string[];
    reasons: string[];
    htmlHardened: boolean;
    /** Always true for file-extracted bodies — cannot rewrite execution logic. */
    untrustedExternal: boolean;
    /** User gate outcome; denied content must never enter the editor panel. */
    userVerdict?: 'pending' | 'confirmed' | 'denied' | 'auto';
    /** Strict system-prompt boundary text for agents / future AI paths. */
    systemBoundary?: string;
  };
}

export interface FolderItem {
  id: string;
  name: string;
  accountId: CloudProviderId;
  parentId?: string;
  color?: string;
  itemCount: number;
  /** Finder-style tags (same palette as files). */
  tags?: string[];
}

export interface P2PPeer {
  id: string;
  name: string;
  email: string;
  peerNodeId?: string;
  status: 'seeding' | 'connected' | 'idle' | 'pending';
  transferSpeed?: string;
  progressPercent?: number;
  role: 'admin' | 'editor' | 'viewer';
  publicKey?: string;
}

export interface SharedLibrary {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  accountId: CloudProviderId;
  fileIds: string[];
  role: 'owner' | 'editor' | 'viewer';
  e2eeProtected: boolean;
  createdAt: string;
  members: SharedMember[];
  direction?: 'incoming' | 'outgoing';

  // P2P Protocol & Seeding fields
  p2pProtocol?: string;
  p2pEncryptionCipher?: string;
  p2pSwarmPeers?: number;
  transferSpeed?: string;

  // Incoming: media libraries from other users sent via encrypted P2P protocol
  senderPeerName?: string;
  senderPeerEmail?: string;
  senderPeerNodeId?: string;
  incomingStatus?: 'synced' | 'streaming' | 'verifying';

  // Outgoing: media libraries currently seeding to specified P2P users
  isSeeding?: boolean;
  seedingPeers?: P2PPeer[];
  seedingStatus?: 'active' | 'paused';
  seedingBandwidthCap?: string;
  /** Invite / access expiration ISO date; omit or empty if never. */
  expiresAt?: string;
  /** When false, recipients may stream but not download originals. */
  allowDownloads?: boolean;
}

export interface SharedMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  avatar?: string;
  status: 'active' | 'pending';
}

export interface PhotoAdjustments {
  exposure: number;     // -100 to 100
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  highlights: number;   // -100 to 100
  shadows: number;      // -100 to 100
  warmth: number;       // -100 to 100 (temp)
  tint: number;         // -100 to 100
  saturation: number;   // -100 to 100
  vibrance: number;     // -100 to 100
  sharpness: number;    // 0 to 100
  clarity: number;      // 0 to 100
  vignette: number;     // 0 to 100
  rotation: number;     // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  /** Crop aspect guide while editing (`free` = unconstrained). */
  cropAspect: 'free' | '1:1' | '4:5' | '16:9' | '9:16' | '3:2';
  /** Normalized crop rect in post-rotation image space (0–1). */
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

export type VideoConvertFormat =
  | 'mp4'
  | 'mkv'
  | 'avi'
  | 'gif'
  | 'mp3'
  | 'aac'
  | 'wav'
  | 'flac';

const AUDIO_CONVERT_FORMATS: readonly VideoConvertFormat[] = ['mp3', 'aac', 'wav', 'flac'];

export function isAudioConvertFormat(format: VideoConvertFormat): boolean {
  return AUDIO_CONVERT_FORMATS.includes(format);
}

export function convertFormatMime(format: VideoConvertFormat): string {
  switch (format) {
    case 'gif': return 'image/gif';
    case 'mp3': return 'audio/mpeg';
    case 'aac': return 'audio/aac';
    case 'wav': return 'audio/wav';
    case 'flac': return 'audio/flac';
    case 'mkv': return 'video/x-matroska';
    case 'avi': return 'video/x-msvideo';
    default: return `video/${format}`;
  }
}

export interface VideoConvertOptions {
  format: VideoConvertFormat;
  resolution: 'original' | '4k' | '2k' | '1080p' | '720p' | '480p';
  quality: 'lossless' | 'high' | 'balanced' | 'compact';
  fps: 24 | 30 | 60;
  trimStart: number;
  trimEnd: number;
  includeAudio: boolean;
}

export interface AppNotification {
  id: string;
  type: 'incoming_library' | 'seeding_event' | 'security' | 'storage';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  sender?: {
    name: string;
    email: string;
    avatar?: string;
    peerNodeId?: string;
  };
  libraryData?: {
    name: string;
    description: string;
    coverImage?: string;
    fileIds: string[];
    p2pProtocol: string;
    transferSpeed: string;
    sizeBytes: number;
    itemCount: number;
  };
  status?: 'pending' | 'accepted' | 'declined';
}

export interface RemovableDevice {
  id: string;
  name: string;
  mountPoint: string;
  type: 'nvme_ssd' | 'usb_drive' | 'memory_card' | 'thunderbolt_raid';
  fileSystem: string;
  capacityBytes: number;
  freeBytes: number;
  encrypted: boolean;
  mounted: boolean;
  ejectable: boolean;
  connectionType: 'USB-C 3.2' | 'Thunderbolt 4' | 'CFexpress / SD' | 'USB 3.0';
}

/** Sidebar Favorites shortcut to a local folder, network share, or mounted drive. */
export type FavoriteKind = 'folder' | 'network' | 'device';

export interface FavoriteShortcut {
  id: string;
  name: string;
  kind: FavoriteKind;
  /** Local Files folder id when kind === 'folder'. */
  folderId?: string;
  /** Network server name or removable device id when kind is network/device. */
  sourceId?: string;
}

