import type { FolderItem } from '../types';

/** Stable Local Files roots shown by default (Finder-style order). */
export const DEFAULT_LOCAL_FOLDER_DEFS = [
  { id: 'folder-local-desktop', name: 'Desktop', homeRelative: 'Desktop' },
  { id: 'folder-local-documents', name: 'Documents', homeRelative: 'Documents' },
  { id: 'folder-local-photos', name: 'Photos', homeRelative: 'Pictures' },
  { id: 'folder-local-videos', name: 'Videos', homeRelative: 'Movies' },
  { id: 'folder-local-music', name: 'Music', homeRelative: 'Music' },
  { id: 'folder-local-downloads', name: 'Downloads', homeRelative: 'Downloads' },
  { id: 'folder-local-applications', name: 'Applications', absolutePath: '/Applications' },
] as const;

const DEFAULT_ORDER = new Map(
  DEFAULT_LOCAL_FOLDER_DEFS.map((def, index) => [def.name.toLowerCase(), index]),
);

const DEFAULT_ID_BY_NAME = new Map(
  DEFAULT_LOCAL_FOLDER_DEFS.map(def => [def.name.toLowerCase(), def.id]),
);

/** Empty Local Files roots for the sidebar until a real folder is imported. */
export function createDefaultLocalFolders(): FolderItem[] {
  return DEFAULT_LOCAL_FOLDER_DEFS.map(def => ({
    id: def.id,
    name: def.name,
    accountId: 'all' as const,
    itemCount: 0,
    color: 'sky',
  }));
}

export function defaultLocalFolderIdForName(name: string): string | undefined {
  return DEFAULT_ID_BY_NAME.get(name.toLowerCase());
}

export function defaultLocalFolderNameForId(id: string): string | undefined {
  return DEFAULT_LOCAL_FOLDER_DEFS.find(def => def.id === id)?.name;
}

/** Keep the Finder-style defaults first; other top-level folders follow alphabetically. */
export function sortLocalRootFolders(folders: FolderItem[]): FolderItem[] {
  return [...folders].sort((a, b) => {
    const ai = DEFAULT_ORDER.get(a.name.toLowerCase());
    const bi = DEFAULT_ORDER.get(b.name.toLowerCase());
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Merge imported local folders into the sidebar list.
 * Top-level defaults are matched by display name so stubs are replaced instead of duplicated.
 */
export function mergeLocalFolders(existing: FolderItem[], incoming: FolderItem[]): FolderItem[] {
  const next = [...existing];

  for (const item of incoming) {
    const isTopLevelLocal = !item.parentId && item.accountId === 'all';
    const stableId = isTopLevelLocal ? defaultLocalFolderIdForName(item.name) : undefined;
    const displayName = stableId
      ? (DEFAULT_LOCAL_FOLDER_DEFS.find(d => d.id === stableId)?.name ?? item.name)
      : item.name;
    const normalized: FolderItem = stableId
      ? { ...item, id: stableId, name: displayName }
      : item;

    if (isTopLevelLocal) {
      const idx = next.findIndex(
        f => !f.parentId
          && f.accountId === 'all'
          && (
            f.id === normalized.id
            || f.name.toLowerCase() === normalized.name.toLowerCase()
          ),
      );
      if (idx >= 0) {
        next[idx] = normalized;
        continue;
      }
    }

    const idx = next.findIndex(f => f.id === normalized.id);
    if (idx >= 0) next[idx] = normalized;
    else next.push(normalized);
  }

  return next;
}
