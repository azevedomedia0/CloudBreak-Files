/**
 * A look inside an invite for display only: the library's name, who sent it and when it lapses. The
 * signature is NOT checked here (joining checks it), so nothing read from this decides anything; it only
 * labels the notification. The access token and keys in the invite are never read or shown.
 */

export const INVITE_PREFIX = 'aetherlib:1:';

export interface InvitePreview {
  libraryId: string;
  libraryName: string;
  /** The sender's peer id, as the invite names it. */
  seederPeerId: string;
  role: string;
  /** Unix seconds; 0 means it does not expire. */
  expiresAt: number;
}

export function looksLikeInvite(text: string): boolean {
  return text.trim().startsWith(INVITE_PREFIX);
}

function decodeBase64Url(payload: string): string | null {
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const str = (value: unknown, max = 200): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;

export function parseInvitePreview(text: string): InvitePreview | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(INVITE_PREFIX) || trimmed.length > 200_000) return null;
  const json = decodeBase64Url(trimmed.slice(INVITE_PREFIX.length));
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const libraryId = str(o.libraryId, 120);
  const libraryName = str(o.libraryName);
  const seederPeerId = str(o.seederPeerId, 120);
  if (!libraryId || !libraryName || !seederPeerId) return null;
  const expiresAt = typeof o.expiresAt === 'number' && Number.isFinite(o.expiresAt) ? o.expiresAt : 0;
  return { libraryId, libraryName, seederPeerId, role: str(o.role, 40) ?? 'viewer', expiresAt };
}

/** "a1b2c3d4…" for a long peer id. */
export function shortPeerId(peerId: string): string {
  return peerId.length > 10 ? `${peerId.slice(0, 8)}…` : peerId;
}
