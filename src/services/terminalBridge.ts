/**
 * Interactive PTY bridge. In the Tauri desktop app this talks to a real login
 * shell (zsh on macOS). Browser preview has no PTY — callers should fall back.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** `data` is base64: the raw bytes the shell wrote. */
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

/** Raw bytes for the shell (mouse reports and similar), where text would be altered. */
export async function terminalWriteBinary(id: string, binary: string): Promise<void> {
  await invoke('terminal_write_binary', { id, data: btoa(binary) });
}

/** The shell's working directory, or null when it cannot be read. */
export async function terminalCwd(id: string): Promise<string | null> {
  return invoke<string | null>('terminal_cwd', { id });
}

/** Open a link in the default browser. Only http, https and mailto are accepted. */
export async function terminalOpenUrl(url: string): Promise<void> {
  await invoke('terminal_open_url', { url });
}

/** Decode the bytes of a data event for `term.write`. */
export function decodeTerminalData(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function terminalResize(id: string, cols: number, rows: number): Promise<void> {
  await invoke('terminal_resize', { id, cols, rows });
}

export async function terminalKill(id: string): Promise<void> {
  await invoke('terminal_kill', { id });
}

/** The saved terminal session (JSON), or null when there is none. */
export async function terminalSessionLoad(): Promise<string | null> {
  return invoke<string | null>('terminal_session_load');
}

export async function terminalSessionSave(data: string): Promise<void> {
  await invoke('terminal_session_save', { data });
}

export async function terminalSessionClear(): Promise<void> {
  await invoke('terminal_session_clear');
}

export async function onTerminalData(handler: (ev: TerminalDataEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalDataEvent>('terminal-data', event => handler(event.payload));
}

export async function onTerminalExit(handler: (ev: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>('terminal-exit', event => handler(event.payload));
}
