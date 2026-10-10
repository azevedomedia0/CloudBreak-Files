/**
 * Google Drive through the bundled rclone sidecar ("no setup" sign-in).
 * rclone ships its own Google OAuth client, so no Google Cloud project is needed.
 * The Rust side is `src-tauri/src/rclone.rs`; the token lives in the OS keychain.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { ProviderAccountInfo, ProviderCredentials, RemoteEntry } from './types';

export interface RcloneStatus {
  available: boolean;
  path?: string;
  source: 'bundled' | 'env' | 'homebrew' | 'path' | 'missing';
  installHint: string;
}

interface DriveInfo {
  email?: string;
  displayName?: string;
  usedBytes: number;
  totalBytes: number;
}

interface DriveEntry {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  sizeBytes: number;
  mimeType: string;
  modifiedAt: string;
}

interface DriveListing {
  entries: DriveEntry[];
  truncated: boolean;
}

export async function rcloneStatus(): Promise<RcloneStatus> {
  if (!isTauri()) {
    return { available: false, source: 'missing', installHint: 'Quick sign-in needs the desktop app.' };
  }
  return invoke<RcloneStatus>('rclone_status');
}

/** Opens the system browser for Google sign-in. Resolves to rclone's token JSON. */
export async function signInWithRclone(): Promise<string> {
  if (!isTauri()) throw new Error('Quick sign-in needs the Cloudbreak desktop app.');
  return invoke<string>('rclone_google_authorize');
}

function requireToken(creds: ProviderCredentials): string {
  const token = creds.rcloneToken?.trim();
  if (!token) throw new Error('Google Drive is not signed in');
  return token;
}

export async function testRcloneDrive(creds: ProviderCredentials): Promise<ProviderAccountInfo> {
  const info = await invoke<DriveInfo>('rclone_drive_info', { token: requireToken(creds) });
  return {
    email: info.email || 'unknown@drive',
    displayName: info.displayName,
    usedBytes: info.usedBytes,
    totalBytes: info.totalBytes || 15 * 1024 ** 3,
  };
}

export async function syncRcloneDrive(creds: ProviderCredentials): Promise<{
  account: ProviderAccountInfo;
  entries: RemoteEntry[];
}> {
  const token = requireToken(creds);
  const [account, listing] = await Promise.all([
    testRcloneDrive(creds),
    invoke<DriveListing>('rclone_drive_list', { token }),
  ]);
  const entries: RemoteEntry[] = listing.entries.map(e => ({
    id: `gd-${e.id || e.path}`,
    name: e.name,
    path: e.path,
    isFolder: e.isFolder,
    sizeBytes: e.sizeBytes,
    mimeType: e.isFolder ? 'inode/directory' : e.mimeType || 'application/octet-stream',
    updatedAt: e.modifiedAt || new Date().toISOString(),
  }));
  return { account, entries };
}
