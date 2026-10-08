/**
 * Interactive PTY bridge. In the Tauri desktop app this talks to a real login
 * shell (zsh on macOS). Browser preview has no PTY — callers should fall back.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TerminalDataEvent = { id: string; data: string };
export type TerminalExitEvent = { id: string; code: number | null };

export function terminalAvailable(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export async function terminalCreate(cols: number, rows: number, cwd?: string): Promise<string> {
  return invoke<string>('terminal_create', { cols, rows, cwd: cwd ?? null });
}

export async function terminalWrite(id: string, data: string): Promise<void> {
  await invoke('terminal_write', { id, data });
}

export async function terminalResize(id: string, cols: number, rows: number): Promise<void> {
  await invoke('terminal_resize', { id, cols, rows });
}

export async function terminalKill(id: string): Promise<void> {
  await invoke('terminal_kill', { id });
}

export async function onTerminalData(handler: (ev: TerminalDataEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalDataEvent>('terminal-data', event => handler(event.payload));
}

export async function onTerminalExit(handler: (ev: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>('terminal-exit', event => handler(event.payload));
}
