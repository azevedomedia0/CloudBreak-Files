import { CloudProviderId, FileCategory, FileItem, SharedLibrary } from '../types';

export interface FileFilterOptions {
  selectedLibrary: SharedLibrary | null;
  selectedLibraryId: string | null;
  selectedAccountId: CloudProviderId;
  selectedFolderId: string | null;
  selectedCategory: FileCategory;
  searchQuery: string;
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

export function filterFiles(files: FileItem[], opts: FileFilterOptions): FileItem[] {
  const { selectedLibrary, selectedLibraryId, selectedAccountId, selectedFolderId, selectedCategory, searchQuery } = opts;
  const query = searchQuery.trim().toLowerCase();

  return files.filter(file => {
    if (selectedLibraryId) {
      if (!selectedLibrary?.fileIds.includes(file.id)) return false;
    } else {
      if (!matchesAccount(file, selectedAccountId)) return false;
      if (selectedFolderId && file.folderId !== selectedFolderId) return false;
    }

    if (selectedCategory !== 'all') {
      if (selectedCategory === 'archive') {
        if (!file.encryption.isEncrypted) return false;
      } else if (file.category !== selectedCategory) {
        return false;
      }
    }

    if (query) {
      const matchName = file.name.toLowerCase().includes(query);
      const matchTag = file.tags?.some(t => t.toLowerCase().includes(query));
      if (!matchName && !matchTag) return false;
    }

    return true;
  });
}
