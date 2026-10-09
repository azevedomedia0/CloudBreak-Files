/**
 * Local file access (desktop app only).
 * The folder picker, scanning, reading and saving go through Rust commands in `src-tauri/src/local_fs.rs`,
 * which only touch folders the user has added. In the browser these helpers are unavailable.
 */

import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';

export interface LocalFolder {
  path: string;
  name: string;
  /** Extra roots merged into this sidebar folder (e.g. iCloud Documents twin). */
  extraPaths?: string[];
}

export interface LocalEntry {
  name: string;
  path: string;
  relativePath: string;
  isDir: boolean;
  sizeBytes: number;
  modifiedMs: number;
}

export interface LocalScan {
  entries: LocalEntry[];
  truncated: boolean;
}

export interface LocalFileInfo {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedMs: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const localFs = {
  /** True inside the desktop app. */
  available(): boolean {
    return isTauri();
  },

  /** Show the system folder picker. Resolves to `null` if the user cancels. */
  pickFolder(): Promise<LocalFolder | null> {
    return invoke<LocalFolder | null>('local_pick_folder');
  },

  /** Folder picker for choosing where to save something. Allowed for this session only, never remembered. */
  pickSaveFolder(): Promise<LocalFolder | null> {
    return invoke<LocalFolder | null>('local_pick_save_folder');
  },

  /** Move a file to the Trash. It can be restored from there. */
  trashFile(path: string): Promise<void> {
    return invoke<void>('local_trash_file', { path });
  },

  /**
   * Save a finished media file from the app's temp folder. With `folder` it goes there (renamed if the name is
   * taken); without it the macOS save dialog opens. Resolves to `null` if the user cancels.
   */
  saveFromTemp(tempPath: string, fileName: string, folder?: string): Promise<LocalFileInfo | null> {
    return invoke<LocalFileInfo | null>('local_save_from_temp', { tempPath, fileName, folder: folder ?? null });
  },

  /** Folders added in earlier sessions that still exist. */
  listFolders(): Promise<LocalFolder[]> {
    return invoke<LocalFolder[]>('local_list_folders');
  },

  /** Register Desktop / Documents / Photos / … when those folders exist on disk. */
  ensureStandardFolders(): Promise<LocalFolder[]> {
    return invoke<LocalFolder[]>('local_ensure_standard_folders');
  },

  /** Allow a mounted volume path for scanning (no picker). */
  rememberFolder(path: string): Promise<LocalFolder> {
    return invoke<LocalFolder>('local_remember_folder', { path });
  },

  /** Stop tracking a folder. Nothing on disk is changed. */
  forgetFolder(path: string): Promise<void> {
    return invoke<void>('local_forget_folder', { path });
  },

  scanFolder(path: string): Promise<LocalScan> {
    return invoke<LocalScan>('local_scan_folder', { path });
  },

  /** URL the web view can load directly (images, audio, video). Works for files in added folders. */
  assetUrl(path: string): string {
    return convertFileSrc(path);
  },

  async readBytes(path: string): Promise<Uint8Array> {
    return fromBase64(await invoke<string>('local_read_file', { path }));
  },

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await localFs.readBytes(path));
  },

  writeBytes(path: string, bytes: Uint8Array): Promise<LocalFileInfo> {
    return invoke<LocalFileInfo>('local_write_file', { path, contentBase64: toBase64(bytes) });
  },

  writeText(path: string, text: string): Promise<LocalFileInfo> {
    return invoke<LocalFileInfo>('local_write_text', { path, text });
  },

  rename(path: string, newName: string): Promise<LocalFileInfo> {
    return invoke<LocalFileInfo>('local_rename_file', { path, newName });
  },
};

/** Bytes of a `data:` URL, for saving an edited image. */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Unsupported image data');
  return { mime: match[1], bytes: fromBase64(match[2]) };
}
