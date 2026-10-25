/**
 * Order of the "Playing Next" queue. Audio wraps around like the audio player's own queue
 * (the rest of the list after the current track, then the tracks before it); video stops at the end.
 */
export function upcomingAfter<T extends { id: string }>(queue: T[], currentId: string, wrap: boolean): T[] {
  const at = queue.findIndex(item => item.id === currentId);
  if (at < 0) return queue.filter(item => item.id !== currentId);
  const after = queue.slice(at + 1);
  return wrap ? [...after, ...queue.slice(0, at)] : after;
}
