/**
 * Cloud files with no download link of their own. Google Drive signed in through the bundled rclone
 * lists files but gives no URL, so a file is downloaded to the app's temp folder when it is opened or
 * saved, and the web view reads that copy through the asset protocol.
 */

import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { FileItem } from '../../types';
import { credentialStore } from './credentials';

export interface DownloadedFile {
  /** The copy in the app's media temp folder (what `localFs.saveFromTemp` takes). */
  stagedPath: string;
  /** The same copy as a URL the web view can load. */
  url: string;
  sizeBytes: number;
}

export async function downloadRemoteFile(file: FileItem): Promise<DownloadedFile> {
  const remote = file.remoteFetch;
  if (!remote) throw new Error('This file does not live in a cloud account.');
  if (!isTauri()) throw new Error('Opening Google Drive files needs the Cloudbreak desktop app.');
  const token = credentialStore.get(file.accountId)?.rcloneToken?.trim();
  if (!token) throw new Error('Google Drive is not signed in. Sign in again to open this file.');
  const fetched = await invoke<{ path: string; sizeBytes: number }>('rclone_drive_fetch', {
    token,
    path: remote.path,
    sizeBytes: file.sizeBytes,
  });
  return { stagedPath: fetched.path, url: convertFileSrc(fetched.path), sizeBytes: fetched.sizeBytes };
}
