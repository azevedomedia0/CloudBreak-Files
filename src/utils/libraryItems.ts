import type { FileItem, FolderItem, SharedLibrary } from '../types';
import { formatBytes } from './format';

/** One file going into a new outgoing library, with the name it will have there. */
export interface LibrarySource {
  file: FileItem;
  /** `photo.jpg`, or `Trip/Day 1/photo.jpg` for files that came from a shared folder. */
  name: string;
}

/** What the user picked to share, resolved to a flat list of files. */
export interface LibraryDraft {
  suggestedName: string;
  sources: LibrarySource[];
  fileCount: number;
  /** Folders the user picked (not subfolders inside them). */
  folderCount: number;
  totalBytes: number;
  /** True when a folder held more files than the limit and the rest were left out. */
  truncated: boolean;
}

export interface LibrarySelection {
  files: FileItem[];
  folders: FolderItem[];
}

/** Keeps one library, and the app's memory, from growing without bound. */
export const MAX_LIBRARY_FILES = 500;

/** Turn picked files and folders into a flat, de-duplicated list (folders include everything inside). */
export function buildLibraryDraft(
  selection: LibrarySelection,
  allFiles: FileItem[],
  allFolders: FolderItem[],
): LibraryDraft {
  const childrenOf = new Map<string, FolderItem[]>();
  for (const folder of allFolders) {
    if (!folder.parentId) continue;
    const list = childrenOf.get(folder.parentId) ?? [];
    list.push(folder);
    childrenOf.set(folder.parentId, list);
  }
  const filesIn = new Map<string, FileItem[]>();
  for (const file of allFiles) {
    if (!file.folderId) continue;
    const list = filesIn.get(file.folderId) ?? [];
    list.push(file);
    filesIn.set(file.folderId, list);
  }

  const sources: LibrarySource[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const add = (file: FileItem, name: string) => {
    if (seen.has(file.id)) return;
    if (sources.length >= MAX_LIBRARY_FILES) {
      truncated = true;
      return;
    }
    seen.add(file.id);
    sources.push({ file, name });
  };

  for (const file of selection.files) add(file, file.name);

  const walk = (folder: FolderItem, prefix: string, visited: Set<string>) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    for (const file of filesIn.get(folder.id) ?? []) add(file, `${prefix}/${file.name}`);
    for (const child of childrenOf.get(folder.id) ?? []) walk(child, `${prefix}/${child.name}`, visited);
  };
  for (const folder of selection.folders) walk(folder, folder.name, new Set());

  const only = selection.files.length + selection.folders.length === 1;
  const suggestedName = only
    ? (selection.folders[0]?.name ?? selection.files[0].name.replace(/\.[^./]+$/, ''))
    : 'Shared items';

  return {
    suggestedName,
    sources,
    fileCount: sources.length,
    folderCount: selection.folders.length,
    totalBytes: sources.reduce((sum, s) => sum + s.file.sizeBytes, 0),
    truncated,
  };
}

/** One line for the library dialog, e.g. "2 folders and 1 file · 41 files · 1.2 GB". */
export function describeDraft(draft: LibraryDraft): string {
  const picked = draft.folderCount
    ? `${draft.folderCount} folder${draft.folderCount === 1 ? '' : 's'}`
    : `${draft.fileCount} file${draft.fileCount === 1 ? '' : 's'}`;
  const files = `${draft.fileCount} file${draft.fileCount === 1 ? '' : 's'}`;
  const parts = draft.folderCount ? [picked, files] : [picked];
  parts.push(formatBytes(draft.totalBytes));
  return parts.join(' · ');
}

/** An outgoing library stops being listed once its expiry has passed. */
export function isLibraryExpired(library: Pick<SharedLibrary, 'expiresAt'>, now: number = Date.now()): boolean {
  if (!library.expiresAt) return false;
  const at = Date.parse(library.expiresAt);
  return Number.isFinite(at) && at <= now;
}
