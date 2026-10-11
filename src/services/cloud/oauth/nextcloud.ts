/** Nextcloud Login Flow v2: browser approval, returns a revocable app password. */

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface NextcloudLogin {
  username: string;
  appPassword: string;
  /** WebDAV files endpoint for this user. */
  endpoint: string;
}

export function isNextcloudLoginAvailable(): boolean {
  return isTauri();
}

export async function signInWithNextcloud(server: string): Promise<NextcloudLogin> {
  if (!isTauri()) throw new Error('Nextcloud sign-in requires the Cloudbreak desktop app.');
  return invoke<NextcloudLogin>('nextcloud_login_flow', { server });
}
