import { useState, type Dispatch, type SetStateAction } from 'react';
import type {
  CloudProviderId, FavoriteShortcut, FileItem, FolderItem, RemovableDevice,
} from '../types';
import { pickLocalFolderFromDisk } from '../utils/importLocalFolder';

export interface NetworkServer {
  name: string;
  desc: string;
  icon?: any;
  online: boolean;
}

interface UseSidebarSourcesOptions {
  folders: FolderItem[];
  files: FileItem[];
  selectedAccountId: CloudProviderId;
  selectedFolderId: string | null;
  selectedSourceId: string | null;
  isVaultUnlocked: boolean;
  setFolders: Dispatch<SetStateAction<FolderItem[]>>;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setSelectedAccountId: (id: CloudProviderId) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedLibraryId: (id: string | null) => void;
  setSelectedSourceId: (id: string | null) => void;
  setSelectedFileId: (id: string | null) => void;
  setIsVaultSecurityOpen: (open: boolean) => void;
  showToast: (message: string) => void;
}

/** Sidebar content: local folders, favorites, network servers, removable devices, and what is selected. */
export function useSidebarSources({
  folders, files, selectedAccountId, selectedFolderId, selectedSourceId, isVaultUnlocked,
  setFolders, setFiles, setSelectedAccountId, setSelectedFolderId, setSelectedLibraryId,
  setSelectedSourceId, setSelectedFileId, setIsVaultSecurityOpen, showToast,
}: UseSidebarSourcesOptions) {
  const [removableDevices, setRemovableDevices] = useState<RemovableDevice[]>([]);
  const [customFavorites, setCustomFavorites] = useState<FavoriteShortcut[]>([]);
  const [networkServers, setNetworkServers] = useState<NetworkServer[]>([]);
  const selectedFolder = folders.find(f => f.id === selectedFolderId) || null;

  const handleCreateFolder = (name: string, category: string) => {
    const newId = `folder-${Date.now()}`;
    const parentIsLocal = selectedFolder?.accountId === 'all';
    const newFolder: FolderItem = {
      id: newId,
      name,
      accountId: selectedAccountId === 'all' || parentIsLocal
        ? (parentIsLocal ? 'all' : 'gdrive')
        : selectedAccountId,
      parentId: selectedFolderId ?? undefined,
      itemCount: 0,
      color: category === 'vault' ? 'emerald' : 'sky',
    };
    setFolders(prev => [...prev, newFolder]);
    setSelectedFolderId(newId);
    showToast(`Created folder "${name}"`);
  };

  const handleAddLocalFolderFromDisk = async () => {
    try {
      const imported = await pickLocalFolderFromDisk();
      if (!imported) return;
      setFolders(prev => [...prev, ...imported.folders]);
      if (imported.files.length) {
        setFiles(prev => [...imported.files, ...prev]);
      }
      setSelectedAccountId('all');
      setSelectedLibraryId(null);
      setSelectedSourceId(null);
      setSelectedFolderId(imported.rootFolder.id);
      setSelectedFileId(imported.files[0]?.id ?? null);
      const fileNote = imported.files.length
        ? ` · ${imported.files.length} file${imported.files.length === 1 ? '' : 's'}`
        : '';
      showToast(`Added “${imported.rootFolder.name}” to Local Files${fileNote}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const favoritedSourceIds = new Set(
    customFavorites
      .flatMap(f => [f.sourceId, f.folderId])
      .filter((id): id is string => !!id),
  );

  const handleBrowseFavoriteFolder = async (): Promise<boolean> => {
    const imported = await pickLocalFolderFromDisk();
    if (!imported) return false;
    setFolders(prev => [...prev, ...imported.folders]);
    if (imported.files.length) {
      setFiles(prev => [...imported.files, ...prev]);
    }
    const fav: FavoriteShortcut = {
      id: `fav-${Date.now()}`,
      name: imported.rootFolder.name,
      kind: 'folder',
      folderId: imported.rootFolder.id,
    };
    setCustomFavorites(prev => [...prev, fav]);
    setSelectedAccountId('all');
    setSelectedLibraryId(null);
    setSelectedSourceId(null);
    setSelectedFolderId(imported.rootFolder.id);
    setSelectedFileId(imported.files[0]?.id ?? null);
    showToast(`Added “${imported.rootFolder.name}” to Favorites`);
    return true;
  };

  const handleAddNetworkServer = (name: string, address: string, protocol: string) => {
    const newServer = {
      name: `${name} (${protocol})`,
      desc: address,
      online: true,
    };
    setNetworkServers(prev => [...prev, newServer]);
    showToast(`Connected to server "${name}"`);
  };


  // Picking an account, folder or library leaves any open network share / device.
  const selectAccount = (id: CloudProviderId) => {
    setSelectedSourceId(null);
    setSelectedAccountId(id);
    // Prompt for passphrase only when entering the private vault while locked.
    if (id === 'vault' && !isVaultUnlocked) {
      setIsVaultSecurityOpen(true);
    }
  };
  const selectFolder = (id: string | null) => { setSelectedSourceId(null); setSelectedFolderId(id); };
  const selectLibrary = (id: string | null) => { setSelectedSourceId(null); setSelectedLibraryId(id); };

  const openSource = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setSelectedLibraryId(null);
    setSelectedFolderId(null);
    const first = files.find(f => f.sourceId === sourceId);
    if (first) setSelectedFileId(first.id);
  };

  const handleAddFavoriteNetwork = (serverName: string) => {
    if (favoritedSourceIds.has(serverName)) return;
    setCustomFavorites(prev => [...prev, {
      id: `fav-${Date.now()}`,
      name: serverName,
      kind: 'network',
      sourceId: serverName,
    }]);
    openSource(serverName);
    showToast(`Added “${serverName}” to Favorites`);
  };

  const handleAddFavoriteDevice = (deviceId: string) => {
    if (favoritedSourceIds.has(deviceId)) return;
    const device = removableDevices.find(d => d.id === deviceId);
    if (!device) return;
    setCustomFavorites(prev => [...prev, {
      id: `fav-${Date.now()}`,
      name: device.name,
      kind: 'device',
      sourceId: device.id,
    }]);
    openSource(device.id);
    showToast(`Added “${device.name}” to Favorites`);
  };

  const handleEjectDevice = (deviceId: string) => {
    const device = removableDevices.find(d => d.id === deviceId);
    setRemovableDevices(prev => prev.filter(d => d.id !== deviceId));
    if (selectedSourceId === deviceId) setSelectedSourceId(null);
    if (device) showToast(`Ejected ${device.name}`);
  };

  return {
    removableDevices, customFavorites, networkServers, favoritedSourceIds,
    handleCreateFolder, handleAddLocalFolderFromDisk, handleBrowseFavoriteFolder,
    handleAddNetworkServer, selectAccount, selectFolder, selectLibrary, openSource,
    handleAddFavoriteNetwork, handleAddFavoriteDevice, handleEjectDevice,
  };
}
