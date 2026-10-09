import { CloudProviderId, FileCategory, FileItem, SharedLibrary } from '../types';

export type DateFilter = 'any' | 'today' | '7d' | '30d';

export type FileSortKey = 'name' | 'date' | 'dateAdded' | 'dateOpened' | 'size' | 'kind';
export type FileSortDirection = 'asc' | 'desc';

function timeMs(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export interface FileFilterOptions {
  selectedLibrary: SharedLibrary | null;
  selectedLibraryId: string | null;
  selectedSourceId?: string | null;
  selectedAccountId: CloudProviderId;
  selectedFolderId: string | null;
  selectedCategory: FileCategory;
  searchQuery: string;
  disconnectedAccountIds?: ReadonlySet<string>;
  starredOnly?: boolean;
  dateFilter?: DateFilter;
}

function matchesAccount(file: FileItem, selectedAccountId: CloudProviderId): boolean {
  if (selectedAccountId === 'all') return true;
  return (
    file.accountId === 'all' ||
    file.accountId === selectedAccountId ||
    (selectedAccountId === 's3' && file.accountId === 'onedrive') ||
    (selectedAccountId === 'onedrive' && file.accountId === 's3') ||
    (selectedAccountId === 'cloudflare_r2' && file.accountId === 'mega') ||
    (selectedAccountId === 'mega' && file.accountId === 'cloudflare_r2') ||
    (selectedAccountId === 'nextcloud' && file.accountId === 'nextcloud') ||
    (selectedAccountId === 'vault' && file.accountId === 'vault')
  );
}

function matchesDateFilter(updatedAt: string, dateFilter: DateFilter): boolean {
  if (dateFilter === 'any') return true;
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return true;
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (dateFilter === 'today') return updated >= startOfToday.getTime();
  const days = dateFilter === '7d' ? 7 : 30;
  return updated >= now - days * 24 * 60 * 60 * 1000;
}

export function filterFiles(files: FileItem[], opts: FileFilterOptions): FileItem[] {
  const {
    selectedLibrary, selectedLibraryId, selectedSourceId, selectedAccountId, selectedFolderId,
    selectedCategory, searchQuery, disconnectedAccountIds, starredOnly = false, dateFilter = 'any',
  } = opts;
  const query = searchQuery.trim().toLowerCase();

  return files.filter(file => {
    if (disconnectedAccountIds?.has(file.accountId)) return false;

    // Network-share and device files only show while that source is open.
    if (selectedSourceId ? file.sourceId !== selectedSourceId : file.sourceId) return false;

    // Files / Photos / Videos tabs: every matching item across locations (ignore folder / library scope).
    const locationBrowse =
      selectedCategory === 'files' || selectedCategory === 'photo' || selectedCategory === 'video';

    // An open source is the whole scope; otherwise a library, then account and folder.
    // Folder browse is Finder-style: only files in the selected folder (subfolders are tiles).
    if (!locationBrowse && !selectedSourceId) {
      if (selectedLibraryId) {
        if (!selectedLibrary?.fileIds.includes(file.id)) return false;
      } else {
        if (!matchesAccount(file, selectedAccountId)) return false;
        if (selectedFolderId && file.folderId !== selectedFolderId) return false;
      }
    }

    if (selectedCategory !== 'all' && selectedCategory !== 'files') {
      if (selectedCategory === 'archive') {
        if (!file.encryption.isEncrypted) return false;
      } else if (file.category !== selectedCategory) {
        return false;
      }
    }

    if (starredOnly && !file.starred) return false;
    if (!matchesDateFilter(file.updatedAt, dateFilter)) return false;

    if (query) {
      const matchName = file.name.toLowerCase().includes(query);
      const matchTag = file.tags?.some(t => t.toLowerCase().includes(query));
      if (!matchName && !matchTag) return false;
    }

    return true;
  });
}

/** Stable sort of filtered file lists for the browser toolbar. */
export function sortFiles(
  files: FileItem[],
  key: FileSortKey = 'name',
  direction: FileSortDirection = 'asc',
): FileItem[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'date':
        cmp = timeMs(a.updatedAt) - timeMs(b.updatedAt);
        break;
      case 'dateAdded':
        cmp = timeMs(a.addedAt ?? a.updatedAt) - timeMs(b.addedAt ?? b.updatedAt);
        break;
      case 'dateOpened':
        cmp = timeMs(a.lastOpenedAt) - timeMs(b.lastOpenedAt);
        break;
      case 'size':
        cmp = a.sizeBytes - b.sizeBytes;
        break;
      case 'kind':
        cmp = a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
      case 'name':
      default:
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
    }
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return cmp * dir;
  });
}
