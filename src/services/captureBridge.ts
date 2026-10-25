/** System screenshot and screen recording (desktop app, macOS). */

import { invoke, isTauri } from '@tauri-apps/api/core';

export const captureAvailable = () => isTauri();

/** Lets the user drag a region and saves it on the Desktop. `null` when they cancelled. */
export const takeScreenshot = () => invoke<string | null>('capture_screenshot');

/** Starts a recording, or stops the running one and returns where the movie was saved. */
export const toggleScreenRecording = () =>
  invoke<{ recording: boolean; path: string | null }>('capture_recording_toggle');
