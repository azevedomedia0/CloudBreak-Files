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

export async function updaterAvailable(): Promise<boolean> {
  return isTauri();
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
  const update = await check();
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

/** Download, install, and relaunch. Blocks until install finishes. */
export async function downloadAndInstallUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
