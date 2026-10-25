/**
 * macOS Full Disk Access helpers (desktop app).
 * FDA cannot be granted via a dialog — System Settings must be opened.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

export async function fullDiskAccessGranted(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    return await invoke<boolean>('macos_full_disk_access_status');
  } catch {
    return true;
  }
}

/** Opens System Settings → Full Disk Access when not granted. Returns true if already granted. */
export async function requestFullDiskAccess(): Promise<boolean> {
  if (!isTauri()) return true;
  return invoke<boolean>('macos_request_full_disk_access');
}

export async function screenRecordingGranted(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    return await invoke<boolean>('macos_screen_recording_status');
  } catch {
    return true;
  }
}

/** Shows the macOS prompt, or opens System Settings → Screen & System Audio Recording after a refusal. Returns true if granted. */
export async function requestScreenRecording(): Promise<boolean> {
  if (!isTauri()) return true;
  return invoke<boolean>('macos_request_screen_recording');
}
