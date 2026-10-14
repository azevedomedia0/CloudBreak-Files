/** What "Refresh" on Incoming Libraries reports back, as one sentence for a toast. */

export interface IncomingRefresh {
  libraryId: string;
  name: string;
  /** synced | partial | offline | expired */
  status: 'synced' | 'partial' | 'offline' | 'expired' | string;
  missingChunks: number;
  fetchedChunks: number;
  message?: string | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * There is no server to ask which libraries other people have shared (invite-dial only), so the refresh
 * only completes libraries already joined. The message says so when nothing is waiting.
 */
export function summarizeIncomingRefresh(results: IncomingRefresh[]): string {
  if (results.length === 0) {
    return 'No incoming libraries yet. A library arrives when its owner sends you an invite.';
  }
  const synced = results.filter(r => r.status === 'synced').length;
  const received = results.filter(r => r.fetchedChunks > 0);
  const problems = results.filter(r => r.status !== 'synced');
  const parts: string[] = [];
  if (synced) parts.push(`${plural(synced, 'library is', 'libraries are')} up to date`);
  if (received.length) parts.push(`received new files for ${plural(received.length, 'library', 'libraries')}`);
  const named = (list: IncomingRefresh[]) => list.slice(0, 2).map(r => `"${r.name}"`).join(', ') + (list.length > 2 ? ` and ${list.length - 2} more` : '');
  const offline = problems.filter(r => r.status === 'offline' || r.status === 'partial');
  if (offline.length) parts.push(`could not finish ${named(offline)} (the sender may be offline)`);
  const expired = problems.filter(r => r.status === 'expired');
  if (expired.length) parts.push(`the invite for ${named(expired)} has expired`);
  const text = parts.join(' · ');
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);
  return problems.length === 0
    ? `${capitalised}. New libraries arrive as an invite from their owner.`
    : `${capitalised}.`;
}
