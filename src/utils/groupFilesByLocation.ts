import { FileItem, FolderItem } from '../types';

export interface FileLocationSection {
  /** Local sidebar folder, or null for items outside those locations. */
  folder: FolderItem | null;
  title: string;
  files: FileItem[];
  subfolders: FolderItem[];
}

function fileMatchesLocalFolder(file: FileItem, folder: FolderItem): boolean {
  if (file.folderId === folder.id) return true;
  const path = file.folderPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const name = folder.name.toLowerCase();
  const segments = path.split('/').filter(Boolean);
  const leaf = segments[segments.length - 1]?.toLowerCase();
  return leaf === name || path.toLowerCase() === `/${name}`;
}

function fileInSubtree(file: FileItem, folder: FolderItem, allFolders: FolderItem[]): boolean {
  if (file.folderId === folder.id) return true;
  if (fileMatchesLocalFolder(file, folder) && !file.folderId) return true;
  return allFolders
    .filter(item => item.parentId === folder.id)
    .some(child => fileInSubtree(file, child, allFolders));
}

function isDirectInFolder(file: FileItem, folder: FolderItem, childFolders: FolderItem[]): boolean {
  if (file.folderId === folder.id) return true;
  if (file.folderId && childFolders.some(child => child.id === file.folderId)) return false;
  if (!file.folderId && fileMatchesLocalFolder(file, folder)) return true;
  return false;
}

export interface GroupByLocationOptions {
  /** When false, omit child folders that contain none of the provided files. Default true. */
  includeEmptySubfolders?: boolean;
}

/**
 * Group files into sections using Local Files sidebar order
 * (Desktop → Documents → Photos → Videos → Music → Downloads → Applications → Trash).
 * Child folders appear as folder tiles; their files stay nested until drill-in.
 */
export function groupFilesByLocalFolders(
  files: FileItem[],
  localFolders: FolderItem[],
  allFolders: FolderItem[] = localFolders,
  options: GroupByLocationOptions = {},
): FileLocationSection[] {
  const includeEmptySubfolders = options.includeEmptySubfolders ?? true;
  const topLevel = localFolders.filter(folder => !folder.parentId);
  const claimed = new Set<string>();
  const sections: FileLocationSection[] = [];

  for (const folder of topLevel) {
    const childFolders = allFolders
      .filter(item => item.parentId === folder.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    const inSubtree = files.filter(file => {
      if (claimed.has(file.id)) return false;
      return fileInSubtree(file, folder, allFolders);
    });

    const sectionFiles = inSubtree.filter(file => isDirectInFolder(file, folder, childFolders));

    const subfolders = includeEmptySubfolders
      ? childFolders
      : childFolders.filter(child => inSubtree.some(file => fileInSubtree(file, child, allFolders)));

    inSubtree.forEach(file => claimed.add(file.id));

    if (!sectionFiles.length && !subfolders.length) continue;

    sections.push({
      folder,
      title: folder.name,
      files: sectionFiles,
      subfolders,
    });
  }

  const other = files.filter(file => !claimed.has(file.id));
  if (other.length) {
    sections.push({ folder: null, title: 'Other locations', files: other, subfolders: [] });
  }

  return sections;
}

export function childFoldersOf(parentId: string | null | undefined, folders: FolderItem[]): FolderItem[] {
  if (!parentId) return [];
  return folders
    .filter(folder => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
