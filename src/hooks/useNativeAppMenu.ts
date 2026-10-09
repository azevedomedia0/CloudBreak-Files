import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { emitFileMenuAction, type FileMenuAction } from '../utils/fileMenuBus';

export type NativeAppMenuState = {
  hasSelection: boolean;
  isEncrypted: boolean;
};

/**
 * Installs a native File menu (macOS menu bar / Windows window menu) with
 * common file-browser actions. Handlers run through {@link emitFileMenuAction}.
 */
export function useNativeAppMenu(state: NativeAppMenuState) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const itemsRef = useRef<Map<string, MenuItem>>(new Map());

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    const run = (action: FileMenuAction) => () => {
      emitFileMenuAction(action);
    };

    void (async () => {
      try {
        const needsSelection = (action: FileMenuAction, text: string, accelerator?: string) =>
          MenuItem.new({
            id: `file-${action}`,
            text,
            accelerator,
            enabled: stateRef.current.hasSelection,
            action: run(action),
          });

        const [
          newFolder,
          upload,
          sep1,
          open,
          quickLook,
          sep2,
          getInfo,
          rename,
          duplicate,
          sep3,
          copy,
          share,
          encrypt,
          sep4,
          trash,
          sep5,
          selectAll,
          sep6,
          closeWindow,
        ] = await Promise.all([
          MenuItem.new({
            id: 'file-new-folder',
            text: 'New Folder',
            accelerator: 'CmdOrCtrl+Shift+N',
            action: run('new-folder'),
          }),
          MenuItem.new({
            id: 'file-upload',
            text: 'Upload Files…',
            accelerator: 'CmdOrCtrl+U',
            action: run('upload'),
          }),
          PredefinedMenuItem.new({ item: 'Separator' }),
          needsSelection('open', 'Open', 'CmdOrCtrl+Down'),
          needsSelection('quick-look', 'Quick Look', 'CmdOrCtrl+Y'),
          PredefinedMenuItem.new({ item: 'Separator' }),
          needsSelection('get-info', 'Get Info', 'CmdOrCtrl+I'),
          needsSelection('rename', 'Rename'),
          needsSelection('duplicate', 'Duplicate', 'CmdOrCtrl+D'),
          PredefinedMenuItem.new({ item: 'Separator' }),
          needsSelection('copy', 'Copy', 'CmdOrCtrl+C'),
          needsSelection('share', 'Share…'),
          MenuItem.new({
            id: 'file-encrypt',
            text: stateRef.current.isEncrypted ? 'Decrypt with Vault' : 'Encrypt with Vault',
            enabled: stateRef.current.hasSelection,
            action: run('encrypt'),
          }),
          PredefinedMenuItem.new({ item: 'Separator' }),
          needsSelection('trash', 'Move to Trash', 'CmdOrCtrl+Backspace'),
          PredefinedMenuItem.new({ item: 'Separator' }),
          MenuItem.new({
            id: 'file-select-all',
            text: 'Select All',
            accelerator: 'CmdOrCtrl+A',
            action: run('select-all'),
          }),
          PredefinedMenuItem.new({ item: 'Separator' }),
          PredefinedMenuItem.new({ item: 'CloseWindow' }),
        ]);

        if (cancelled) return;

        itemsRef.current = new Map([
          ['open', open],
          ['quick-look', quickLook],
          ['get-info', getInfo],
          ['rename', rename],
          ['duplicate', duplicate],
          ['copy', copy],
          ['share', share],
          ['encrypt', encrypt],
          ['trash', trash],
        ]);

        const fileMenu = await Submenu.new({
          id: 'file',
          text: 'File',
          items: [
            newFolder,
            upload,
            sep1,
            open,
            quickLook,
            sep2,
            getInfo,
            rename,
            duplicate,
            sep3,
            copy,
            share,
            encrypt,
            sep4,
            trash,
            sep5,
            selectAll,
            sep6,
            closeWindow,
          ],
        });

        const menu = await Menu.default();
        // macOS default: [App, Edit, View, Window, Help] — insert File after App.
        // Windows default already has a File submenu; replace by inserting ours at 0.
        const existing = await menu.items();
        const firstText = existing[0] && 'text' in existing[0]
          ? await (existing[0] as Submenu).text().catch(() => '')
          : '';
        const insertAt = firstText === 'File' ? 0 : Math.min(1, existing.length);
        if (firstText === 'File') {
          await menu.remove(existing[0]!);
        }
        await menu.insert(fileMenu, insertAt);
        await menu.setAsAppMenu();
      } catch (err) {
        console.warn('Native File menu failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      itemsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const { hasSelection, isEncrypted } = state;
    for (const [id, item] of itemsRef.current) {
      if (id === 'encrypt') {
        void item.setEnabled(hasSelection);
        void item.setText(isEncrypted ? 'Decrypt with Vault' : 'Encrypt with Vault');
      } else {
        void item.setEnabled(hasSelection);
      }
    }
  }, [state.hasSelection, state.isEncrypted]);
}
