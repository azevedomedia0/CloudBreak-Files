import type { FileItem } from '../types';

/** Custom MIME for in-app FileItem drags (browser → terminal). */
export const CLOUDBREAK_FILE_MIME = 'application/x-cloudbreak-file';

export type DraggedFilePayload = {
  id: string;
  name: string;
  /** Logical path for the terminal (folderPath/name). */
  path: string;
  /** Everything being dragged when the dragged item is part of a multi-selection (includes `id`). */
  ids?: string[];
};

export function fileTerminalPath(file: FileItem): string {
  const folder = file.folderPath?.replace(/\/$/, '') || '';
  if (!folder || folder === '/') return `/${file.name}`;
  return `${folder}/${file.name}`;
}

export function quoteShellPath(path: string): string {
  if (!path) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** `selectedIds` is the current selection; it travels with the drag only when the dragged item is one of several. */
export function setFileDragData(dataTransfer: DataTransfer, file: FileItem, selectedIds?: Set<string>): void {
  const payload: DraggedFilePayload = {
    id: file.id,
    name: file.name,
    path: fileTerminalPath(file),
  };
  if (selectedIds && selectedIds.size > 1 && selectedIds.has(file.id)) payload.ids = [...selectedIds];
  dataTransfer.setData(CLOUDBREAK_FILE_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.path);
  dataTransfer.effectAllowed = 'copy';
}

/** True while an in-app file drag is over a target (the data itself is only readable on drop). */
export function isCloudbreakFileDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(CLOUDBREAK_FILE_MIME);
}

/** File ids from an in-app drag: the whole selection when there was one, else the dragged file. */
export function readDroppedFileIds(dataTransfer: DataTransfer): string[] {
  const raw = dataTransfer.getData(CLOUDBREAK_FILE_MIME);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DraggedFilePayload;
    if (Array.isArray(parsed.ids) && parsed.ids.length) return parsed.ids;
    return parsed.id ? [parsed.id] : [];
  } catch {
    return [];
  }
}

export function readDroppedPaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];

  const raw = dataTransfer.getData(CLOUDBREAK_FILE_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DraggedFilePayload;
      if (parsed?.path) paths.push(parsed.path);
    } catch {
      /* ignore */
    }
  }

  if (dataTransfer.files?.length) {
    for (const file of Array.from(dataTransfer.files)) {
      const anyFile = file as File & { path?: string };
      paths.push(anyFile.path || `/${file.name}`);
    }
  }

  if (!paths.length) {
    const text = dataTransfer.getData('text/plain')?.trim();
    if (text && !text.includes('\n')) paths.push(text);
  }

  // Dedupe while preserving order
  return [...new Set(paths)];
}
