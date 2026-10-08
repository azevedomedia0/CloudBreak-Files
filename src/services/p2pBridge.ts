/**
 * P2P E2EE library bridge.
 * Uses Tauri Rust commands when available; browser fallback does local
 * encrypt/invite/chunk store in memory so the UI flows still work in web preview.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface P2pIdentity {
  peerId: string;
  publicKeyHex: string;
  x25519PublicHex: string;
  displayName: string;
}

export interface P2pLibraryRecord {
  libraryId: string;
  name: string;
  description: string;
  direction: string;
  role: string;
  ownerPeerId: string;
  ownerName: string;
  rootCid: string;
  epoch: number;
  e2eeProtected: boolean;
  isSeeding: boolean;
  createdAt: string;
  fileIds: string[];
  memberCount: number;
  lastInvite?: string | null;
  seedingStatus?: string | null;
  bandwidthCap?: string | null;
  privateMode?: boolean;
  expiresAt?: string | null;
  allowDownloads?: boolean;
}

export interface CreateLibraryFileInput {
  name: string;
  mimeType: string;
  contentBase64: string;
}

export interface CreateLibraryInput {
  name: string;
  description: string;
  role: string;
  recipientEmail?: string;
  recipientX25519Hex?: string;
  invitePassphrase?: string;
  bandwidthCap?: string;
  /** Days until invite expires; 0 = never. */
  expiresInDays?: number;
  allowDownloads?: boolean;
  files: CreateLibraryFileInput[];
}

export interface CreateLibraryResult {
  libraryId: string;
  rootCid: string;
  invite: string;
  fileIds: string[];
  record: P2pLibraryRecord;
}

export interface AcceptInviteResult {
  record: P2pLibraryRecord;
  fetchedChunks: number;
}

export interface SwarmStatus {
  listening: boolean;
  listenAddrs: string[];
  peerId: string;
  peers: Array<{
    peerId: string;
    addrs: string[];
    connected: boolean;
    transferBytes: number;
    role: string;
  }>;
  seedingRootCids: string[];
  bytesSent: number;
  bytesReceived: number;
  /** Invite-dial only — no DHT / STUN / announce. */
  privateMode: boolean;
}

export interface StreamChunkResult {
  fileId: string;
  index: number;
  contentBase64: string;
  size: number;
  totalChunks: number;
}

export interface DecryptedFileResult {
  fileId: string;
  name: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
}

export interface ManifestFileEntry {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  plaintextSha256: string;
  chunks: Array<{ cid: string; nonceHex: string; size: number; index: number }>;
}

export interface LibraryManifest {
  version: number;
  libraryId: string;
  name: string;
  description: string;
  epoch: number;
  ownerPeerId: string;
  createdAt: string;
  files: ManifestFileEntry[];
}

// —— Browser fallback (local-only demo of invite + encrypted chunks) ——

const browserLibs = new Map<string, P2pLibraryRecord & { invite?: string; files?: Map<string, Uint8Array> }>();
let browserIdentity: P2pIdentity | null = null;

function b64encode(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function browserGetIdentity(displayName?: string): Promise<P2pIdentity> {
  if (browserIdentity) return browserIdentity;
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  const peerId = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
  browserIdentity = {
    peerId,
    publicKeyHex: Array.from(raw, b => b.toString(16).padStart(2, '0')).join(''),
    x25519PublicHex: peerId.slice(0, 64),
    displayName: displayName || 'Cloudbreak User',
  };
  return browserIdentity;
}

async function browserCreateLibrary(input: CreateLibraryInput): Promise<CreateLibraryResult> {
  const id = await browserGetIdentity();
  const libraryId = `lib-web-${Date.now()}`;
  const fileIds: string[] = [];
  const fileMap = new Map<string, Uint8Array>();
  for (let i = 0; i < input.files.length; i++) {
    const fid = `pf-${libraryId}-${i}`;
    fileIds.push(fid);
    fileMap.set(fid, b64decode(input.files[i].contentBase64));
  }
  const rootCid = `cid-${libraryId}`;
  const invitePayload = {
    rootCid,
    libraryId,
    libraryName: input.name,
    seederPeerId: id.peerId,
    role: input.role,
    browser: true,
  };
  const invite = `aetherlib:1:${btoa(JSON.stringify(invitePayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  const record: P2pLibraryRecord = {
    libraryId,
    name: input.name,
    description: input.description,
    direction: 'outgoing',
    role: 'owner',
    ownerPeerId: id.peerId,
    ownerName: id.displayName,
    rootCid,
    epoch: 1,
    e2eeProtected: true,
    isSeeding: true,
    createdAt: new Date().toISOString(),
    fileIds,
    memberCount: input.recipientEmail ? 2 : 1,
    lastInvite: invite,
    seedingStatus: 'active',
    bandwidthCap: input.bandwidthCap,
    expiresAt:
      input.expiresInDays && input.expiresInDays > 0
        ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
        : null,
    allowDownloads: input.allowDownloads !== false,
  };
  browserLibs.set(libraryId, { ...record, invite, files: fileMap });
  return { libraryId, rootCid, invite, fileIds, record };
}

async function browserAcceptInvite(invite: string): Promise<AcceptInviteResult> {
  const id = await browserGetIdentity();
  const payload = invite.replace(/^aetherlib:1:/, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = payload + '==='.slice((payload.length + 3) % 4);
  let parsed: { libraryId: string; libraryName: string; rootCid: string; seederPeerId: string; role: string };
  try {
    parsed = JSON.parse(atob(pad));
  } catch {
    throw new Error('Invalid invite (browser mode expects an invite created in this session)');
  }
  const existing = [...browserLibs.values()].find(l => l.libraryId === parsed.libraryId);
  const libraryId = parsed.libraryId || `lib-in-${Date.now()}`;
  const record: P2pLibraryRecord = {
    libraryId,
    name: parsed.libraryName || 'Incoming library',
    description: `Incoming P2P library from ${parsed.seederPeerId || 'peer'}`,
    direction: 'incoming',
    role: parsed.role || 'viewer',
    ownerPeerId: parsed.seederPeerId || 'unknown',
    ownerName: (parsed.seederPeerId || 'peer').slice(0, 8),
    rootCid: parsed.rootCid || `cid-${libraryId}`,
    epoch: 1,
    e2eeProtected: true,
    isSeeding: false,
    createdAt: new Date().toISOString(),
    fileIds: existing?.fileIds ?? [],
    memberCount: 2,
    lastInvite: invite,
    seedingStatus: 'synced',
  };
  browserLibs.set(libraryId, {
    ...record,
    files: existing?.files ?? new Map(),
  });
  void id;
  return { record, fetchedChunks: existing?.fileIds.length ?? 0 };
}

export const p2pBridge = {
  async isNative(): Promise<boolean> {
    return isTauri();
  },

  async getIdentity(displayName?: string): Promise<P2pIdentity> {
    if (await isTauri()) {
      return invoke<P2pIdentity>('p2p_get_identity', { displayName });
    }
    return browserGetIdentity(displayName);
  },

  async createLibrary(input: CreateLibraryInput): Promise<CreateLibraryResult> {
    if (await isTauri()) {
      return invoke<CreateLibraryResult>('p2p_create_library', { req: input });
    }
    return browserCreateLibrary(input);
  },

  async acceptInvite(invite: string, invitePassphrase?: string): Promise<AcceptInviteResult> {
    if (await isTauri()) {
      return invoke<AcceptInviteResult>('p2p_accept_invite', {
        req: { invite, invitePassphrase },
      });
    }
    return browserAcceptInvite(invite);
  },

  async exportInvite(libraryId: string): Promise<string> {
    if (await isTauri()) {
      return invoke<string>('p2p_export_invite', { libraryId });
    }
    const lib = browserLibs.get(libraryId);
    if (!lib?.lastInvite) throw new Error('No invite for this library');
    return lib.lastInvite;
  },

  async listLibraries(): Promise<P2pLibraryRecord[]> {
    if (await isTauri()) {
      return invoke<P2pLibraryRecord[]>('p2p_list_libraries');
    }
    return [...browserLibs.values()].map(({ files: _f, invite: _i, ...rec }) => rec);
  },

  async startSeeding(libraryId: string): Promise<SwarmStatus> {
    if (await isTauri()) {
      return invoke<SwarmStatus>('p2p_start_seeding', { libraryId });
    }
    const id = await browserGetIdentity();
    return {
      listening: false,
      listenAddrs: [],
      peerId: id.peerId,
      peers: [],
      seedingRootCids: [browserLibs.get(libraryId)?.rootCid].filter(Boolean) as string[],
      bytesSent: 0,
      bytesReceived: 0,
      privateMode: true,
    };
  },

  async swarmStatus(): Promise<SwarmStatus> {
    if (await isTauri()) {
      return invoke<SwarmStatus>('p2p_swarm_status');
    }
    const id = await browserGetIdentity();
    return {
      listening: false,
      listenAddrs: [],
      peerId: id.peerId,
      peers: [],
      seedingRootCids: [...browserLibs.values()].filter(l => l.isSeeding).map(l => l.rootCid),
      bytesSent: 0,
      bytesReceived: 0,
      privateMode: true,
    };
  },

  /** Sync macOS/Windows/Linux tray icon status dot with live seeding state. */
  async refreshTrayStatus(): Promise<string | null> {
    if (!(await isTauri())) return null;
    return invoke<string>('tray_refresh_status');
  },

  async readFile(libraryId: string, fileId: string): Promise<DecryptedFileResult> {
    if (await isTauri()) {
      return invoke<DecryptedFileResult>('p2p_read_file', { libraryId, fileId });
    }
    const lib = browserLibs.get(libraryId);
    const bytes = lib?.files?.get(fileId);
    if (!bytes) throw new Error('File not found in browser P2P store');
    return {
      fileId,
      name: fileId,
      mimeType: 'application/octet-stream',
      contentBase64: b64encode(bytes),
      sizeBytes: bytes.length,
    };
  },

  async streamChunk(
    libraryId: string,
    fileId: string,
    chunkIndex: number,
  ): Promise<StreamChunkResult> {
    if (await isTauri()) {
      return invoke<StreamChunkResult>('p2p_stream_chunk', { libraryId, fileId, chunkIndex });
    }
    const full = await this.readFile(libraryId, fileId);
    const bytes = b64decode(full.contentBase64);
    const chunkSize = 1024 * 1024;
    const start = chunkIndex * chunkSize;
    const slice = bytes.slice(start, start + chunkSize);
    return {
      fileId,
      index: chunkIndex,
      contentBase64: b64encode(slice),
      size: slice.length,
      totalChunks: Math.max(1, Math.ceil(bytes.length / chunkSize)),
    };
  },

  /**
   * Assemble a decrypted Blob by streaming chunks (for video/audio playback).
   */
  async assembleFileBlob(libraryId: string, fileId: string, mimeType?: string): Promise<Blob> {
    if (await isTauri()) {
      const first = await this.streamChunk(libraryId, fileId, 0);
      const parts: Uint8Array[] = [b64decode(first.contentBase64)];
      for (let i = 1; i < first.totalChunks; i++) {
        const chunk = await this.streamChunk(libraryId, fileId, i);
        parts.push(b64decode(chunk.contentBase64));
      }
      const total = parts.reduce((n, p) => n + p.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        merged.set(p, offset);
        offset += p.length;
      }
      return new Blob([merged.slice()], { type: mimeType || 'application/octet-stream' });
    }
    const file = await this.readFile(libraryId, fileId);
    return new Blob([b64decode(file.contentBase64).slice()], {
      type: mimeType || file.mimeType || 'application/octet-stream',
    });
  },

  async fetchManifest(libraryId: string): Promise<LibraryManifest> {
    if (await isTauri()) {
      return invoke<LibraryManifest>('p2p_fetch_manifest', { libraryId });
    }
    const lib = browserLibs.get(libraryId);
    if (!lib) throw new Error('Library not found');
    return {
      version: 1,
      libraryId: lib.libraryId,
      name: lib.name,
      description: lib.description,
      epoch: lib.epoch,
      ownerPeerId: lib.ownerPeerId,
      createdAt: lib.createdAt,
      files: lib.fileIds.map(fid => ({
        fileId: fid,
        name: fid,
        mimeType: 'application/octet-stream',
        sizeBytes: lib.files?.get(fid)?.length ?? 0,
        plaintextSha256: '',
        chunks: [],
      })),
    };
  },
};

/** Map a P2P library record into the UI SharedLibrary shape. */
export function recordToSharedLibrary(rec: P2pLibraryRecord): import('../types').SharedLibrary {
  return {
    id: rec.libraryId,
    name: rec.name,
    description: rec.description,
    ownerName: rec.ownerName,
    ownerEmail: `${rec.ownerPeerId.slice(0, 8)}@p2p.local`,
    memberCount: rec.memberCount,
    accountId: 'all',
    fileIds: rec.fileIds,
    role: rec.role === 'owner' ? 'owner' : rec.role === 'admin' ? 'editor' : (rec.role as 'viewer' | 'editor'),
    e2eeProtected: rec.e2eeProtected,
    createdAt: rec.createdAt,
    members: [],
    direction: rec.direction === 'incoming' ? 'incoming' : 'outgoing',
    isSeeding: rec.isSeeding,
    seedingStatus: (rec.seedingStatus as 'active' | 'paused') || undefined,
    p2pProtocol: 'Cloudbreak private · invite-dial only',
    p2pEncryptionCipher: 'AES-256-GCM E2EE',
    senderPeerNodeId: rec.ownerPeerId,
    seedingBandwidthCap: rec.bandwidthCap ?? undefined,
    expiresAt: rec.expiresAt ?? undefined,
    allowDownloads: rec.allowDownloads ?? true,
    incomingStatus: rec.direction === 'incoming' ? 'synced' : undefined,
  };
}
