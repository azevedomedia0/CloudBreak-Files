/**
 * Desktop auto-update checks via tauri-plugin-updater.
 * Manifest: GitHub Releases `latest.json` (signed with the updater key pair).
 */

import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';

export type UpdateCheckResult =
  | { available: false; currentVersion: string }
  | {
      available: true;
      currentVersion: string;
      version: string;
      notes: string | null | undefined;
      date: string | null | undefined;
      update: Update;
    };

/** Updates are published for macOS only. Linux builds update through Flatpak or the package manager. */
export function updatesSupportedHere(): boolean {
  return isTauri() && /Mac/i.test(navigator.userAgent);
}

export async function updaterAvailable(): Promise<boolean> {
  return updatesSupportedHere();
}

/** Turn the updater's raw error into something a person can act on. */
export function describeUpdateError(err: unknown, action: 'check' | 'install' = 'check'): string {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  if (text.includes('signature')) return 'The update’s signature didn’t verify, so nothing was installed.';
  if (text.includes('platform')) return 'No update has been published for this computer yet.';
  if (text.includes('could not fetch') || text.includes('valid release')) return 'No update information is published yet. Try again later.';
  if (text.includes('request') || text.includes('network') || text.includes('dns') || text.includes('connect') || text.includes('timed out')) {
    return 'Couldn’t reach GitHub. Check your connection and try again.';
  }
  return action === 'install' ? `Couldn’t install the update: ${raw}` : `Couldn’t check for updates: ${raw}`;
}

export async function currentAppVersion(): Promise<string> {
  if (!isTauri()) return 'web';
  try {
    return await getVersion();
  } catch {
    return 'unknown';
  }
}

/** Query the hosted manifest. Returns null-style result when already up to date. */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await currentAppVersion();
  if (!isTauri()) {
    return { available: false, currentVersion };
  }
  const update = await check({ timeout: 15_000 });
  if (!update) {
    return { available: false, currentVersion };
  }
  return {
    available: true,
    currentVersion,
    version: update.version,
    notes: update.body,
    date: update.date,
    update,
  };
}

export interface UpdateProgress {
  downloaded: number;
  /** Total size in bytes, or null when the server didn't say. */
  total: number | null;
  phase: 'downloading' | 'installing';
}

/** Download, install, and relaunch. Reports progress; blocks until the app restarts. */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall(event => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null;
      onProgress?.({ downloaded, total, phase: 'downloading' });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.({ downloaded, total, phase: 'downloading' });
    } else if (event.event === 'Finished') {
      onProgress?.({ downloaded, total, phase: 'installing' });
    }
  });
  await relaunch();
}
