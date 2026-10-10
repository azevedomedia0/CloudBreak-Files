import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  CloudProviderId, FavoriteShortcut, FileItem, FolderItem, RemovableDevice,
} from '../types';
import { importLocalFolderAtPath, mergeById, pickLocalFolderFromDisk } from '../utils/importLocalFolder';
import {
  DEFAULT_LOCAL_FOLDER_DEFS,
  defaultLocalFolderIdForName,
  mergeLocalFolders,
} from '../utils/defaultLocalFolders';
import { desktopScanReady, markDesktopScanReady, markDesktopScanSkipped } from '../utils/startupGate';
import { localFs, type LocalFolder } from '../services/localFsBridge';
import {
  ejectVolume,
  listSidebarVolumes,
  loadSavedNetworkServers,
  mountedVolumeToNetworkServer,
  openNetworkShare,
  persistSavedNetworkServers,
  probeNetworkServer,
  type NetworkServerEntry,
  type SavedNetworkServer,
  volumeToRemovableDevice,
} from '../services/volumesBridge';
import { delay, whenIdle } from '../utils/deferWork';

export type { NetworkServerEntry };

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

const VOLUME_POLL_MS = 8_000;
const DESKTOP_ROOT_ID = DEFAULT_LOCAL_FOLDER_DEFS[0].id;
/** How many local roots to scan at once after Desktop. */
const LOCAL_SCAN_CONCURRENCY = 2;

const STANDARD_SCAN_ORDER = new Map(
  DEFAULT_LOCAL_FOLDER_DEFS.map((def, index) => [def.name.toLowerCase(), index]),
);

/** Desktop always first; other standards follow Finder order; heavy roots last. */
function localScanPriority(folderName: string, rootId: string | undefined): number {
  if (rootId === DESKTOP_ROOT_ID || folderName.toLowerCase() === 'desktop') return 0;
  if (folderName === 'Applications') return 200;
  if (folderName === 'Photos') return 190;
  const order = STANDARD_SCAN_ORDER.get(folderName.toLowerCase());
  if (order != null) return 10 + order;
  return 100;
}

/** Sidebar content: local folders, favorites, network servers, removable devices, and what is selected. */
export function useSidebarSources({
  folders, files, selectedAccountId, selectedFolderId, selectedSourceId, isVaultUnlocked,
  setFolders, setFiles, setSelectedAccountId, setSelectedFolderId, setSelectedLibraryId,
  setSelectedSourceId, setSelectedFileId, setIsVaultSecurityOpen, showToast,
}: UseSidebarSourcesOptions) {
  const [removableDevices, setRemovableDevices] = useState<RemovableDevice[]>([]);
  const [customFavorites, setCustomFavorites] = useState<FavoriteShortcut[]>([]);
  const [savedNetworkServers, setSavedNetworkServers] = useState<SavedNetworkServer[]>(() => loadSavedNetworkServers());
  const [networkServers, setNetworkServers] = useState<NetworkServerEntry[]>([]);
  const [isRescanningLocal, setIsRescanningLocal] = useState(false);
  const savedRef = useRef(savedNetworkServers);
  savedRef.current = savedNetworkServers;
  const rescanBusyRef = useRef(false);

  const selectedFolder = folders.find(f => f.id === selectedFolderId) || null;

  const mergeNetworkLists = useCallback((
    saved: SavedNetworkServer[],
    reachability: Map<string, boolean>,
    mounted: NetworkServerEntry[],
  ): NetworkServerEntry[] => {
    const savedEntries: NetworkServerEntry[] = saved.map(s => ({
      id: s.id,
      name: s.name,
      desc: s.address,
      online: reachability.get(s.id) ?? false,
      protocol: s.protocol,
      kind: 'saved',
    }));
    const dedupedMounted = mounted.filter(m => {
      return !savedEntries.some(s => s.name.toLowerCase() === m.name.toLowerCase());
    });
    return [...dedupedMounted, ...savedEntries];
  }, []);

  const refreshVolumesAndServers = useCallback(async () => {
    let volumes: Awaited<ReturnType<typeof listSidebarVolumes>> = [];
    try {
      volumes = await listSidebarVolumes();
    } catch (err) {
      console.warn('list_sidebar_volumes failed', err);
    }
    const mountedNet = volumes.filter(v => v.isNetwork).map(mountedVolumeToNetworkServer);
    // Skip recovery / installer volumes that clutter the sidebar.
    const removable = volumes
      .filter(v => !v.isNetwork)
      .filter(v => {
        const n = v.name.toLowerCase();
        return n !== 'recovery' && !n.includes('installer') && n !== 'com.apple.timestate';
      })
      .map(volumeToRemovableDevice);
    setRemovableDevices(removable);

    const saved = savedRef.current;
    const reachability = new Map<string, boolean>();
    await Promise.all(saved.map(async s => {
      const ok = await probeNetworkServer(s.address, s.protocol).catch(() => false);
      reachability.set(s.id, ok);
    }));

    setNetworkServers(mergeNetworkLists(saved, reachability, mountedNet));
  }, [mergeNetworkLists]);

  // Defer volume/network probe past first paint; avoid double-refresh on mount.
  useEffect(() => {
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void (async () => {
        await desktopScanReady;
        if (!cancelled) void refreshVolumesAndServers();
      })();
    }, 600);
    if (!localFs.available()) {
      return () => {
        cancelled = true;
        cancelIdle();
      };
    }
    const id = window.setInterval(() => { void refreshVolumesAndServers(); }, VOLUME_POLL_MS);
    return () => {
      cancelled = true;
      cancelIdle();
      window.clearInterval(id);
    };
  }, [refreshVolumesAndServers]);

  const skipNetworkPersistRefresh = useRef(true);
  useEffect(() => {
    persistSavedNetworkServers(savedNetworkServers);
    if (skipNetworkPersistRefresh.current) {
      skipNetworkPersistRefresh.current = false;
      return;
    }
    void refreshVolumesAndServers();
  }, [savedNetworkServers, refreshVolumesAndServers]);

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

  const normalizeImported = (imported: Awaited<ReturnType<typeof importLocalFolderAtPath>>) => {
    const rootId = defaultLocalFolderIdForName(imported.rootFolder.name);
    const folders = rootId
      ? imported.folders.map(f => (
        f.id === imported.rootFolder.id
          ? { ...f, id: rootId }
          : f.parentId === imported.rootFolder.id
            ? { ...f, parentId: rootId }
            : f
      ))
      : imported.folders;
    const files = rootId
      ? imported.files.map(f => (
        f.folderId === imported.rootFolder.id ? { ...f, folderId: rootId } : f
      ))
      : imported.files;
    const rootFolder = rootId
      ? { ...imported.rootFolder, id: rootId }
      : imported.rootFolder;
    return { rootFolder, folders, files };
  };

  const pruneAppFolders = (list: FolderItem[]) =>
    list.filter(f => !f.name.toLowerCase().endsWith('.app'));

  const applyImportedFolder = (imported: Awaited<ReturnType<typeof importLocalFolderAtPath>>) => {
    const { rootFolder, folders, files } = normalizeImported(imported);
    // .app packages are FileItems now — drop any leftover folder tiles from older scans.
    setFolders(prev => pruneAppFolders(mergeLocalFolders(prev, folders)));
    if (files.length) {
      setFiles(prev => mergeById(prev, files));
    }
    return rootFolder;
  };

  /** Merge many parallel imports into one React update (startup / rescan). */
  const applyImportedFoldersBatch = (
    imports: Array<Awaited<ReturnType<typeof importLocalFolderAtPath>>>,
  ) => {
    if (!imports.length) return;
    const allFolders: FolderItem[] = [];
    const allFiles: FileItem[] = [];
    for (const imported of imports) {
      const { folders, files } = normalizeImported(imported);
      allFolders.push(...folders);
      allFiles.push(...files);
    }
    setFolders(prev => pruneAppFolders(mergeLocalFolders(prev, allFolders)));
    if (allFiles.length) {
      setFiles(prev => mergeById(prev, allFiles));
    }
  };

  /** Descendants of a Local Files root (not including the root itself). */
  const collectDescendantFolderIds = (all: FolderItem[], rootId: string): Set<string> => {
    const ids = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of all) {
        if (!f.parentId || ids.has(f.id)) continue;
        if (f.parentId === rootId || ids.has(f.parentId)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    return ids;
  };

  const pathIsUnderRoot = (filePath: string | undefined, rootPath: string): boolean => {
    if (!filePath) return false;
    const root = rootPath.replace(/\/+$/, '');
    return filePath === root || filePath.startsWith(`${root}/`);
  };

  /**
   * Rescan disk folders: replace each sidebar subtree and local files so deletes
   * on disk disappear. Applies all results in one setState pass.
   */
  const applyRescannedFoldersBatch = (
    items: Array<{
      imported: Awaited<ReturnType<typeof importLocalFolderAtPath>>;
      diskPaths: string[];
    }>,
  ) => {
    if (!items.length) return;

    const normalized = items.map(({ imported, diskPaths }) => ({
      ...normalizeImported(imported),
      diskPaths,
    }));

    setFolders(prev => {
      let next = prev;
      for (const { rootFolder, folders: nextFolders } of normalized) {
        const rootId = rootFolder.id;
        const nextFolderIds = new Set(nextFolders.map(f => f.id));
        const staleKids = collectDescendantFolderIds(next, rootId);
        const kept = next.filter(f => {
          if (f.id === rootId) return false;
          if (staleKids.has(f.id) && !nextFolderIds.has(f.id)) return false;
          return true;
        });
        next = mergeLocalFolders(kept, nextFolders);
      }
      return pruneAppFolders(next);
    });

    setFiles(prev => {
      const dropRoots = normalized.flatMap(n => n.diskPaths);
      const folderScopes = new Set<string>();
      for (const { rootFolder } of normalized) {
        folderScopes.add(rootFolder.id);
        for (const id of collectDescendantFolderIds(folders, rootFolder.id)) {
          folderScopes.add(id);
        }
      }
      const kept = prev.filter(f => {
        if (dropRoots.some(root => pathIsUnderRoot(f.localPath, root))) return false;
        if (f.localPath && f.folderId && folderScopes.has(f.folderId)) return false;
        if (
          f.accountId === 'all'
          && f.folderId
          && folderScopes.has(f.folderId)
          && f.id.startsWith('file-local-')
        ) {
          return false;
        }
        return true;
      });
      const nextFiles = normalized.flatMap(n => n.files);
      return mergeById(kept, nextFiles);
    });
  };

  const diskPathsFor = (folder: LocalFolder): string[] => (
    [folder.path, ...(folder.extraPaths ?? [])].filter(Boolean)
  );

  const handleRescanLocalFolders = async () => {
    if (!localFs.available()) {
      showToast('Rescan is available in the desktop app');
      return;
    }
    if (rescanBusyRef.current) return;
    rescanBusyRef.current = true;
    setIsRescanningLocal(true);
    try {
      // ensure is cheap when roots are unchanged (single save_roots only if dirty).
      const standards = await localFs.ensureStandardFolders().catch(() => [] as LocalFolder[]);
      const saved = await localFs.listFolders().catch(() => [] as LocalFolder[]);
      const byPath = new Map<string, LocalFolder>();
      const covered = new Set(standards.flatMap(diskPathsFor));
      // Standards win (they carry iCloud extraPaths); skip twins already merged in.
      for (const f of saved) {
        if (covered.has(f.path)) continue;
        byPath.set(f.path, f);
      }
      for (const f of standards) byPath.set(f.path, f);
      const targets = [...byPath.values()];
      if (!targets.length) {
        showToast('No local folders to rescan — add a folder first');
        return;
      }

      let fileTotal = 0;
      let truncated = false;
      const errors: string[] = [];
      const batch: Array<{
        imported: Awaited<ReturnType<typeof importLocalFolderAtPath>>;
        diskPaths: string[];
      }> = [];

      // Import in parallel so a huge Desktop tree cannot block Documents / Downloads.
      await Promise.all(targets.map(async folder => {
        try {
          const imported = await importLocalFolderAtPath(folder, {
            rootId: defaultLocalFolderIdForName(folder.name),
            displayName: folder.name,
          });
          batch.push({ imported, diskPaths: diskPathsFor(folder) });
          fileTotal += imported.files.length;
          if (imported.truncated) truncated = true;
        } catch (err) {
          errors.push(`${folder.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }));

      applyRescannedFoldersBatch(batch);
      const ok = batch.length;

      if (ok === 0 && errors.length) {
        showToast(`Rescan failed. ${errors[0]}`);
      } else {
        const trunc = truncated ? ' (some folders truncated)' : '';
        const errNote = errors.length ? ` · ${errors.length} folder(s) skipped` : '';
        showToast(
          `Rescanned ${ok} folder${ok === 1 ? '' : 's'} · ${fileTotal} file${fileTotal === 1 ? '' : 's'}${trunc}${errNote}`,
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      rescanBusyRef.current = false;
      setIsRescanningLocal(false);
    }
  };

  const handleAddLocalFolderFromDisk = async () => {
    try {
      const imported = await pickLocalFolderFromDisk();
      if (!imported) return;
      const rootFolder = applyImportedFolder(imported);
      setSelectedAccountId('all');
      setSelectedLibraryId(null);
      setSelectedSourceId(null);
      setSelectedFolderId(rootFolder.id);
      setSelectedFileId(imported.files[0]?.id ?? null);
      const fileNote = imported.files.length
        ? ` · ${imported.files.length} file${imported.files.length === 1 ? '' : 's'}`
        : '';
      showToast(`Added “${rootFolder.name}” to Local Files${fileNote}${imported.truncated ? ' (large folder: only the first items were added)' : ''}`);
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
    const rootFolder = applyImportedFolder(imported);
    const fav: FavoriteShortcut = {
      id: `fav-${Date.now()}`,
      name: rootFolder.name,
      kind: 'folder',
      folderId: rootFolder.id,
    };
    setCustomFavorites(prev => [...prev, fav]);
    setSelectedAccountId('all');
    setSelectedLibraryId(null);
    setSelectedSourceId(null);
    setSelectedFolderId(rootFolder.id);
    setSelectedFileId(imported.files[0]?.id ?? null);
    showToast(`Added “${rootFolder.name}” to Favorites`);
    return true;
  };

  const handleAddNetworkServer = (name: string, address: string, protocol: string) => {
    void (async () => {
      const finalAddress = address.trim() || `${protocol.toLowerCase()}://${name.replace(/\s+/g, '-').toLowerCase()}.local`;
      const id = `server-${Date.now()}`;
      const entry: SavedNetworkServer = {
        id,
        name: name.trim(),
        address: finalAddress,
        protocol: protocol.toUpperCase(),
      };

      if (localFs.available()) {
        try {
          await openNetworkShare(entry.protocol, finalAddress);
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      }

      const reachable = await probeNetworkServer(finalAddress, entry.protocol).catch(() => false);
      setSavedNetworkServers(prev => [...prev, entry]);
      setSelectedSourceId(id);
      setSelectedLibraryId(null);
      setSelectedFolderId(null);

      if (reachable) {
        showToast(`Added “${entry.name}”. The server responded on the network.`);
      } else {
        showToast(`Saved “${entry.name}”. It is not reachable yet — check the address or mount the share in Finder.`);
      }
    })();
  };

  const selectAccount = (id: CloudProviderId) => {
    setSelectedSourceId(null);
    setSelectedAccountId(id);
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

  const handleSelectRemovableDevice = (device: RemovableDevice) => {
    openSource(device.id);
    if (!localFs.available() || !device.mountPoint) return;
    void (async () => {
      try {
        await localFs.rememberFolder(device.mountPoint);
        const folder = { path: device.mountPoint, name: device.name };
        const imported = await importLocalFolderAtPath(folder, {
          rootId: defaultLocalFolderIdForName(device.name),
          displayName: device.name,
        }).catch(() => null);
        if (!imported) return;
        const root = applyImportedFolder(imported);
        setSelectedFolderId(root.id);
        const tagged = imported.files.map(f => ({ ...f, sourceId: device.id }));
        setFiles(prev => mergeById(prev, tagged));
        if (tagged[0]) setSelectedFileId(tagged[0].id);
      } catch {
        // Volume may be unreadable until the user grants access in Local Files.
      }
    })();
  };

  const handleSelectNetworkServer = (server: NetworkServerEntry) => {
    openSource(server.id);
    if (server.kind === 'mounted' && server.mountPoint && localFs.available()) {
      void (async () => {
        await localFs.rememberFolder(server.mountPoint!).catch(() => null);
        const imported = await importLocalFolderAtPath(
          { path: server.mountPoint!, name: server.name },
          { rootId: defaultLocalFolderIdForName(server.name), displayName: server.name },
        ).catch(() => null);
        if (!imported) return;
        const root = applyImportedFolder(imported);
        setSelectedFolderId(root.id);
        const tagged = imported.files.map(f => ({ ...f, sourceId: server.id }));
        setFiles(prev => mergeById(prev, tagged));
        if (tagged[0]) setSelectedFileId(tagged[0].id);
      })();
    }
  };

  const handleAddFavoriteNetwork = (serverId: string) => {
    if (favoritedSourceIds.has(serverId)) return;
    const server = networkServers.find(s => s.id === serverId);
    if (!server) return;
    setCustomFavorites(prev => [...prev, {
      id: `fav-${Date.now()}`,
      name: server.name,
      kind: 'network',
      sourceId: server.id,
    }]);
    openSource(server.id);
    showToast(`Added “${server.name}” to Favorites`);
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
    if (!device) return;
    void (async () => {
      try {
        if (localFs.available()) {
          await ejectVolume(device.mountPoint);
        }
        setRemovableDevices(prev => prev.filter(d => d.id !== deviceId));
        if (selectedSourceId === deviceId) setSelectedSourceId(null);
        showToast(`Ejected ${device.name}`);
        void refreshVolumesAndServers();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  // Restore local folders after first paint: Desktop alone, then the rest (parallel batches).
  useEffect(() => {
    if (!localFs.available()) {
      markDesktopScanSkipped();
      return;
    }
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void (async () => {
        try {
          const standards = await localFs.ensureStandardFolders().catch(() => [] as LocalFolder[]);
          const saved = await localFs.listFolders().catch(() => [] as LocalFolder[]);
          if (cancelled) return;
          const standardPaths = new Set(standards.flatMap(f => diskPathsFor(f)));

          type ImportJob = {
            folder: LocalFolder;
            opts?: { rootId?: string; displayName: string };
            priority: number;
          };

          const jobs: ImportJob[] = [
            ...standards.map(folder => {
              const rootId = defaultLocalFolderIdForName(folder.name);
              return {
                folder,
                opts: { rootId, displayName: folder.name },
                priority: localScanPriority(folder.name, rootId),
              };
            }),
            ...saved
              .filter(folder => !standardPaths.has(folder.path))
              .map(folder => ({ folder, priority: 150 } as ImportJob)),
          ];
          jobs.sort((a, b) => a.priority - b.priority);

          const importOne = async (job: ImportJob) => {
            if (cancelled) return null;
            return importLocalFolderAtPath(job.folder, job.opts).catch(() => null);
          };

          const desktopIdx = jobs.findIndex(
            j => j.opts?.rootId === DESKTOP_ROOT_ID || j.folder.name.toLowerCase() === 'desktop',
          );
          const desktopJob = desktopIdx >= 0 ? jobs[desktopIdx] : jobs[0];
          const rest = desktopIdx >= 0
            ? [...jobs.slice(0, desktopIdx), ...jobs.slice(desktopIdx + 1)]
            : jobs.slice(1);

          if (desktopJob) {
            const imp = await importOne(desktopJob);
            if (!cancelled && imp) applyImportedFoldersBatch([imp]);
          }
          markDesktopScanReady();

          for (let i = 0; i < rest.length; i += LOCAL_SCAN_CONCURRENCY) {
            if (cancelled) return;
            await delay(0);
            const batch = rest.slice(i, i + LOCAL_SCAN_CONCURRENCY);
            const imports = (await Promise.all(batch.map(importOne))).filter(
              (imp): imp is NonNullable<typeof imp> => imp != null,
            );
            if (!cancelled && imports.length) applyImportedFoldersBatch(imports);
          }
        } catch {
          markDesktopScanReady();
        }
      })();
    }, 80);

    return () => {
      cancelled = true;
      cancelIdle();
      markDesktopScanReady();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- launch-only
  }, []);

  return {
    removableDevices, customFavorites, networkServers, favoritedSourceIds,
    isRescanningLocal,
    handleCreateFolder, handleAddLocalFolderFromDisk, handleBrowseFavoriteFolder,
    handleRescanLocalFolders,
    handleAddNetworkServer, selectAccount, selectFolder, selectLibrary, openSource,
    handleAddFavoriteNetwork, handleAddFavoriteDevice, handleEjectDevice,
    handleSelectRemovableDevice, handleSelectNetworkServer,
  };
}
