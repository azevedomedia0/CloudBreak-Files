/** Shared actions for the app menu bar File menu and the native OS File menu. */

export const FILE_MENU_ACTION_EVENT = 'aether:file-menu-action';

export type FileMenuAction =
  | 'new-folder'
  | 'upload'
  | 'open'
  | 'get-info'
  | 'rename'
  | 'duplicate'
  | 'copy'
  | 'share'
  | 'encrypt'
  | 'trash'
  | 'select-all';

export type FileMenuActionDetail = { action: FileMenuAction };

/** A menu shortcut that arrived while the terminal had focus; the terminal decides what it means there. */
export const TERMINAL_MENU_ACTION_EVENT = 'aether:terminal-menu-action';

/** True when typing would go to the terminal or a text field, where file shortcuts must not act on files. */
function focusIsInTextTarget(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.closest('.system-terminal-panel')) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function emitFileMenuAction(action: FileMenuAction) {
  // ⌘⌫, ⌘C, ⌘A and ⌘D belong to the File menu, so they also arrive while typing in the terminal. Never let
  // them move, copy or select files then.
  if (focusIsInTextTarget()) {
    if (document.activeElement?.closest('.system-terminal-panel')) {
      window.dispatchEvent(new CustomEvent<FileMenuActionDetail>(TERMINAL_MENU_ACTION_EVENT, { detail: { action } }));
    }
    return;
  }
  window.dispatchEvent(
    new CustomEvent<FileMenuActionDetail>(FILE_MENU_ACTION_EVENT, {
      detail: { action },
    }),
  );
}

export function fileMenuActionLabel(action: FileMenuAction, encrypted?: boolean): string {
  switch (action) {
    case 'new-folder': return 'New Folder';
    case 'upload': return 'Upload Files…';
    case 'open': return 'Open';
    case 'get-info': return 'Get Info';
    case 'rename': return 'Rename';
    case 'duplicate': return 'Duplicate';
    case 'copy': return 'Copy';
    case 'share': return 'Share…';
    case 'encrypt': return encrypted ? 'Decrypt with Vault' : 'Encrypt with Vault';
    case 'trash': return 'Move to Trash';
    case 'select-all': return 'Select All';
  }
}
