/** Shared actions for the app menu bar File menu and the native OS File menu. */

export const FILE_MENU_ACTION_EVENT = 'aether:file-menu-action';

export type FileMenuAction =
  | 'new-folder'
  | 'upload'
  | 'open'
  | 'quick-look'
  | 'get-info'
  | 'rename'
  | 'duplicate'
  | 'copy'
  | 'share'
  | 'encrypt'
  | 'trash'
  | 'select-all';

export type FileMenuActionDetail = { action: FileMenuAction };

export function emitFileMenuAction(action: FileMenuAction) {
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
    case 'quick-look': return 'Quick Look';
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
