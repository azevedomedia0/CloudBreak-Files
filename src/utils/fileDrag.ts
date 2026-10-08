import type { FileItem } from '../types';

/** Custom MIME for in-app FileItem drags (browser → terminal). */
export const CLOUDBREAK_FILE_MIME = 'application/x-cloudbreak-file';

export type DraggedFilePayload = {
  id: string;
  name: string;
  /** Logical path for the terminal (folderPath/name). */
  path: string;
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

export function setFileDragData(dataTransfer: DataTransfer, file: FileItem): void {
  const payload: DraggedFilePayload = {
    id: file.id,
    name: file.name,
    path: fileTerminalPath(file),
  };
  dataTransfer.setData(CLOUDBREAK_FILE_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.path);
  dataTransfer.effectAllowed = 'copy';
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
