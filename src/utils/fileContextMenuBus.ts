import { FileItem } from '../types';

export const FILE_CONTEXT_MENU_EVENT = 'aether:file-context-menu';

export type FileContextMenuDetail = {
  file: FileItem;
  clientX: number;
  clientY: number;
};

/** Open the shared file context menu from any thumbnail (e.g. inspector preview). */
export function emitFileContextMenu(file: FileItem, clientX: number, clientY: number) {
  window.dispatchEvent(
    new CustomEvent<FileContextMenuDetail>(FILE_CONTEXT_MENU_EVENT, {
      detail: { file, clientX, clientY },
    }),
  );
}
