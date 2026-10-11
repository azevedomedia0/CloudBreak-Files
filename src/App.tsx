/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MacFinderToolbar, MacViewMode } from './components/MacFinderToolbar';
import { Sidebar } from './components/Sidebar';
import { useResizablePanel } from './hooks/useResizablePanel';
import { DateFilter, FileSortDirection, FileSortKey, filterFiles, sortFiles } from './utils/filterFiles';
import { useToast } from './hooks/useToast';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useNativeAppMenu } from './hooks/useNativeAppMenu';
import { useFileActions } from './hooks/useFileActions';
import { useVault } from './hooks/useVault';
import { useP2pLibraries } from './hooks/useP2pLibraries';
import { useCloudAccounts } from './hooks/useCloudAccounts';
import { useNotifications } from './hooks/useNotifications';
import { useSidebarSources } from './hooks/useSidebarSources';
import { useNavHistory, type NavLocation } from './hooks/useNavHistory';
import { useSystemSearch } from './hooks/useSystemSearch';
import { localPathFromFolderId } from './components/file-browser/FolderContextMenu';
import { FILE_MENU_ACTION_EVENT, type FileMenuActionDetail } from './utils/fileMenuBus';
import { mergeSystemSearchResults, systemSearchBridge } from './services/systemSearchBridge';
import { AppModals } from './components/AppModals';
import { PhotoNav } from './components/PhotoNavArrows';
import { UserProfile } from './components/ProfileSettingsModal';
import { DropOverlay } from './components/DropOverlay';
import { Toast } from './components/Toast';
import { FileBrowser } from './components/FileBrowser';
import { FileInspector } from './components/FileInspector';
import { SystemTerminal } from './components/SystemTerminal';
import { DocumentEditorModal } from './components/document-editor/DocumentEditorModal';

import {
  CloudAccount, FileItem, FolderItem, SharedLibrary,
  CloudProviderId, FileCategory,
} from './types';
import { createDefaultLocalFolders, DEFAULT_LOCAL_FOLDER_DEFS } from './utils/defaultLocalFolders';
import { getFfmpegStatus } from './services/mediaBridge';
import {
  checkForAppUpdate,
  currentAppVersion,
  downloadAndInstallUpdate,
  updaterAvailable,
} from './services/updaterBridge';
import { isTauri } from '@tauri-apps/api/core';
import { whenIdle } from './utils/deferWork';
import { desktopScanReady } from './utils/startupGate';
import {
  AppPreferences,
  applyTheme,
  loadPreferences,
  loadProfile,
  savePreferences,
  saveProfile,
} from './utils/appPreferences';
import { p2pBridge } from './services/p2pBridge';
import { localFs } from './services/localFsBridge';
import { withNativeRaster } from './services/previewBridge';
import {
  isEditableDocument,
  isPlainTextDocument,
  isSystemPreviewDocument,
  TEXT_UPLOAD_MAX_BYTES,
} from './utils/documentKind';
import {
  prepareDocumentBodyForOpen,
  sanitizeContextLabel,
  untrustedExternalSafetyMeta,
  type ContentSafetyReport,
} from './utils/contentSafety';
import { UntrustedContentGate } from './components/UntrustedContentGate';

export default function App() {
  // Accounts & Navigation States
  const [selectedAccountId, setSelectedAccountId] = useState<CloudProviderId>('all');
  const [folders, setFolders] = useState<FolderItem[]>(() => createDefaultLocalFolders());
  // Start on Desktop (not the unscoped “All Files” view).
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    () => DEFAULT_LOCAL_FOLDER_DEFS.find(d => d.name === 'Desktop')?.id ?? 'folder-local-desktop',
  );
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  // A network share or removable device (by stable id) opened from the sidebar Network section
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Sidebar dynamic items & modals
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState<boolean>(false);
  const [isNewLibraryOpen, setIsNewLibraryOpen] = useState<boolean>(false);
  const [isJoinIncomingOpen, setIsJoinIncomingOpen] = useState<boolean>(false);
  const [isAddFavoriteOpen, setIsAddFavoriteOpen] = useState<boolean>(false);
  const [isConnectServerOpen, setIsConnectServerOpen] = useState<boolean>(false);

  // Files State
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');
  const [sortKey, setSortKey] = useState<FileSortKey>('name');
  const [sortDirection, setSortDirection] = useState<FileSortDirection>('asc');
  const [appPreferences, setAppPreferencesState] = useState<AppPreferences>(() => loadPreferences());
  const [viewMode, setViewMode] = useState<MacViewMode>(() => loadPreferences().defaultView);

  // Modals & Panels
  const [isQuickLookOpen, setIsQuickLookOpen] = useState<boolean>(false);
  const [editingPhotoFile, setEditingPhotoFile] = useState<FileItem | null>(null);
  const [editingDocumentFile, setEditingDocumentFile] = useState<FileItem | null>(null);
  /** Staged file open waiting on Confirm / Deny — body must not enter the editor until confirmed. */
  const [pendingUntrustedOpen, setPendingUntrustedOpen] = useState<{
    file: FileItem;
    body: string;
    report: ContentSafetyReport;
  } | null>(null);
  const [playingVideoFile, setPlayingVideoFile] = useState<FileItem | null>(null);
  const [playingAudioFile, setPlayingAudioFile] = useState<FileItem | null>(null);
  const [videoPlayerInitialTab, setVideoPlayerInitialTab] = useState<'player' | 'trim' | 'convert'>('player');
  const [sharingLibrary, setSharingLibrary] = useState<SharedLibrary | null>(null);
  const [isVaultSecurityOpen, setIsVaultSecurityOpen] = useState<boolean>(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState<boolean>(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile>(() => loadProfile());
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [integratingAccount, setIntegratingAccount] = useState<CloudAccount | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [sidePanelMode, setSidePanelMode] = useState<'inspector' | 'terminal'>('inspector');

  const setUserProfile = (profile: UserProfile) => {
    setUserProfileState(profile);
    saveProfile(profile);
  };

  const setAppPreferences = (prefs: AppPreferences) => {
    setAppPreferencesState(prefs);
    savePreferences(prefs);
    applyTheme(prefs.theme);
    setViewMode(prefs.defaultView);
  };

  // Resizable sidebar & inspector widths
  const { width: sidebarWidth, isResizing: isResizingSidebar, startResize: startResizeSidebar, reset: resetSidebarWidth } =
    useResizablePanel({ initial: 240, min: 180, max: 380, grow: 'right' });
  const { width: inspectorWidth, isResizing: isResizingInspector, startResize: startResizeInspector, reset: resetInspectorWidth } =
    useResizablePanel({ initial: 320, min: 260, max: () => Math.max(480, Math.round(window.innerWidth * 0.65)), grow: 'left' });
  /** Columns view: equal-width columns hug content; inspector stays on the right (resizable). */
  const columnsInspectorLayout =
    viewMode === 'columns' && isInspectorOpen && sidePanelMode === 'inspector' && !editingDocumentFile;

  const { toast: toastNotification, showToast } = useToast();

  const { isVaultUnlocked, handleToggleVaultLock } = useVault(appPreferences, showToast);
  const {
    sharedLibraries, setSharedLibraries, swarmStatus,
    refreshSwarm, copyLibraryInvite, handleCreateLibrary, handleJoinIncomingLibrary,
  } = useP2pLibraries({
    userName: userProfile.name,
    files, selectedFileId, selectedLibraryId,
    setFiles, setSelectedFileId, setSelectedLibraryId, showToast,
  });
  const {
    accounts, setAccounts, disconnectedAccountIds,
    handleMountCloudAccount, handleSyncCloudLibrary, handleDisconnectAccount,
  } = useCloudAccounts({
    files, selectedFileId, selectedAccountId,
    setFolders, setFiles, setSelectedFileId,
    setSelectedAccountId, setSelectedFolderId, setSelectedLibraryId, setSelectedSourceId,
    showToast,
  });
  const {
    notifications, isNotificationOpen, setIsNotificationOpen,
    handleAcceptLibraryNotification, handleDeclineLibraryNotification,
    handleMarkAllNotificationsRead, handleClearNotification,
  } = useNotifications({ setSharedLibraries, setSelectedLibraryId, setSelectedFolderId, showToast });

  // Apply theme + reduce-motion preferences to the document root
  useEffect(() => {
    applyTheme(appPreferences.theme);
  }, [appPreferences.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', appPreferences.reduceMotion);
  }, [appPreferences.reduceMotion]);

  // One-time notice when the desktop app has no ffmpeg (dev builds / incomplete release).
  useEffect(() => {
    if (!isTauri()) return;
    const key = 'cloudbreak.ffmpegMissingDismissed';
    try {
      if (localStorage.getItem(key) === '1') return;
    } catch { /* private mode */ }
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void desktopScanReady.then(() => getFfmpegStatus()).then(status => {
        if (cancelled || status.available) return;
        showToast(status.installHint || 'ffmpeg is required for video trim and convert.');
        try {
          localStorage.setItem(key, '1');
        } catch { /* ignore */ }
      });
    }, 2500);
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [showToast]);

  // Remind when Full Disk Access is still off (native side opens Settings once on first launch).
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const key = 'cloudbreak.fdaReminderDismissed';
    const cancelIdle = whenIdle(() => {
      void (async () => {
        try {
          await desktopScanReady;
          if (localStorage.getItem(key) === '1') return;
          const { fullDiskAccessGranted } = await import('./services/permissionsBridge');
          const granted = await fullDiskAccessGranted();
          if (cancelled || granted) return;
          showToast('Turn on Cloudbreak Files under System Settings → Privacy & Security → Full Disk Access');
          try {
            localStorage.setItem(key, '1');
          } catch { /* ignore */ }
        } catch {
          // Browser or older build without the command.
        }
      })();
    }, 3000);
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [showToast]);

  // Resolve installed version + quiet launch check for a newer signed release.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void currentAppVersion().then(v => {
      if (!cancelled) setAppVersion(v);
    });
    const key = 'cloudbreak.updatePromptDismissed';
    const cancelIdle = whenIdle(() => {
      void (async () => {
        try {
          await desktopScanReady;
          if (!(await updaterAvailable())) return;
          const result = await checkForAppUpdate();
          if (cancelled || !result.available) return;
          const dismissed = (() => {
            try {
              return localStorage.getItem(key);
            } catch {
              return null;
            }
          })();
          if (dismissed === result.version) return;
          showToast(`Update ${result.version} is available — open Profile → Preferences to install`);
          try {
            localStorage.setItem(key, result.version);
          } catch { /* ignore */ }
        } catch {
          // Offline / private repo / no latest.json yet — quiet.
        }
      })();
    }, 5000);
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [showToast]);

  const handleCheckForUpdates = async () => {
    if (!isTauri()) {
      showToast('Updates are available in the desktop app');
      return;
    }
    setUpdateChecking(true);
    try {
      const result = await checkForAppUpdate();
      if (!result.available) {
        showToast(`You’re on the latest version (${result.currentVersion})`);
        return;
      }
      const note = result.notes ? ` — ${result.notes.slice(0, 80)}` : '';
      showToast(`Downloading update ${result.version}${note}…`);
      await downloadAndInstallUpdate(result.update);
      // relaunch is called inside downloadAndInstallUpdate
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdateChecking(false);
    }
  };

  useGlobalShortcuts({
    canQuickLook: !!selectedFileId && !editingPhotoFile && !editingDocumentFile && !playingVideoFile && !playingAudioFile && !sharingLibrary,
    onToggleSidebar: () => setIsSidebarCollapsed(prev => !prev),
    onToggleQuickLook: () => setIsQuickLookOpen(prev => !prev),
  });

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const selectedFileForMenu =
    files.find(f => f.id === selectedFileId)
    || null;
  useNativeAppMenu({
    hasSelection: !!selectedFileId,
    isEncrypted: !!selectedFileForMenu?.encryption?.isEncrypted,
    onCheckForUpdates: handleCheckForUpdates,
  });

  useEffect(() => {
    const onFileMenu = (event: Event) => {
      const action = (event as CustomEvent<FileMenuActionDetail>).detail?.action;
      if (action === 'new-folder') setIsNewFolderOpen(true);
      if (action === 'upload') uploadInputRef.current?.click();
    };
    window.addEventListener(FILE_MENU_ACTION_EVENT, onFileMenu);
    return () => window.removeEventListener(FILE_MENU_ACTION_EVENT, onFileMenu);
  }, []);

  const {
    removableDevices, customFavorites, networkServers, favoritedSourceIds,
    isRescanningLocal,
    handleCreateFolder, handleAddLocalFolderFromDisk, handleBrowseFavoriteFolder,
    handleRescanLocalFolders,
    handleAddNetworkServer, selectAccount, selectFolder, selectLibrary, openSource,
    handleAddFavoriteNetwork, handleAddFavoriteDevice, handleEjectDevice,
    handleSelectRemovableDevice, handleSelectNetworkServer,
  } = useSidebarSources({
    folders, files, selectedAccountId, selectedFolderId, selectedSourceId, isVaultUnlocked,
    setFolders, setFiles, setSelectedAccountId, setSelectedFolderId, setSelectedLibraryId,
    setSelectedSourceId, setSelectedFileId, setIsVaultSecurityOpen, showToast,
  });

  const selectedFolder = folders.find(f => f.id === selectedFolderId) || null;
  const selectedLibrary = sharedLibraries.find(lib => lib.id === selectedLibraryId) || null;
  const { systemResults, systemSearching } = useSystemSearch(searchQuery);

  const markFileOpened = (fileId: string) => {
    const now = new Date().toISOString();
    setFiles(prev => prev.map(f => (f.id === fileId ? { ...f, lastOpenedAt: now } : f)));
  };

  const openFileSelection = (file: FileItem) => {
    setSelectedFileId(file.id);
    markFileOpened(file.id);
  };

  /** Open HEIC/RAW/TIFF via a web-viewable raster when needed, then Photo Studio. */
  const openPhotoFile = async (file: FileItem) => {
    openFileSelection(file);
    const ready = await withNativeRaster(file);
    if (ready.thumbnailUrl && ready.thumbnailUrl !== file.thumbnailUrl) {
      setFiles(prev => prev.map(f => (f.id === file.id ? { ...f, thumbnailUrl: ready.thumbnailUrl, url: ready.url } : f)));
    }
    setEditingPhotoFile(ready);
  };

  /** Load local text; every extracted body is untrusted external content (strict boundaries). */
  const openDocumentFile = async (file: FileItem) => {
    openFileSelection(file);
    if (isSystemPreviewDocument(file)) {
      setIsQuickLookOpen(true);
      return;
    }

    // Never leave a previous editor panel open while a gate is pending.
    setEditingDocumentFile(null);
    setPendingUntrustedOpen(null);

    let rawBody = file.documentBody;
    if (
      rawBody == null
      && file.localPath
      && localFs.available()
      && isEditableDocument(file)
      && file.sizeBytes <= TEXT_UPLOAD_MAX_BYTES
      && (isPlainTextDocument(file) || /\.html?$/i.test(file.name))
    ) {
      try {
        rawBody = await localFs.readText(file.localPath);
      } catch {
        rawBody = undefined;
      }
    }

    if (rawBody == null) {
      setEditingDocumentFile({
        ...file,
        contentSafety: untrustedExternalSafetyMeta(
          { risk: 'none', flags: [], reasons: [], htmlHardened: false },
          'auto',
        ),
      });
      return;
    }

    const asHtml = !isPlainTextDocument(file) || /\.html?$/i.test(file.name);
    const prepared = prepareDocumentBodyForOpen(rawBody, { treatAsHtml: asHtml });

    // Suspicious / malicious-looking activity: Confirm or Deny before body can enter any panel.
    if (prepared.requiresAck) {
      setPendingUntrustedOpen({
        file: { ...file, documentBody: undefined },
        body: prepared.body,
        report: prepared.report,
      });
      return;
    }

    const safeFile: FileItem = {
      ...file,
      documentBody: prepared.body,
      contentSafety: untrustedExternalSafetyMeta(prepared.report, 'auto'),
    };
    // Keep library list in sync with hardened body only (never raw).
    setFiles(prev => prev.map(f => (f.id === file.id ? { ...f, documentBody: prepared.body } : f)));
    if (prepared.report.htmlHardened || prepared.report.risk === 'low') {
      showToast('Opened as untrusted external content — cannot rewrite app logic');
    }
    setEditingDocumentFile(safeFile);
  };

  const confirmUntrustedOpen = () => {
    if (!pendingUntrustedOpen) return;
    const { file, body, report } = pendingUntrustedOpen;
    const safeFile: FileItem = {
      ...file,
      documentBody: body,
      contentSafety: untrustedExternalSafetyMeta(report, 'confirmed'),
    };
    setFiles(prev => prev.map(f => (f.id === file.id ? { ...f, documentBody: body } : f)));
    setPendingUntrustedOpen(null);
    setEditingDocumentFile(safeFile);
    showToast('Confirmed — viewing as data only (execution logic unchanged)');
  };

  const denyUntrustedOpen = () => {
    if (!pendingUntrustedOpen) return;
    const { file } = pendingUntrustedOpen;
    // Discard extracted content so it cannot rewrite execution logic or linger in the panel.
    setFiles(prev => prev.map(f => (
      f.id === file.id
        ? {
            ...f,
            documentBody: undefined,
            contentSafety: untrustedExternalSafetyMeta(
              pendingUntrustedOpen.report,
              'denied',
            ),
          }
        : f
    )));
    setPendingUntrustedOpen(null);
    setEditingDocumentFile(null);
    showToast('Denied — panel closed, extracted content discarded');
  };

  const filteredFiles = useMemo(() => {
    const filterOpts = {
      selectedLibrary, selectedLibraryId, selectedSourceId, selectedAccountId, selectedFolderId,
      selectedCategory, searchQuery, disconnectedAccountIds, starredOnly, dateFilter,
    };
    return sortFiles(
      mergeSystemSearchResults(
        filterFiles(files, filterOpts),
        searchQuery.trim().length >= 2
          ? filterFiles(systemResults, {
              ...filterOpts,
              selectedFolderId: null,
              selectedLibraryId: null,
              selectedSourceId: null,
              selectedLibrary: null,
            })
          : [],
      ),
      sortKey,
      sortDirection,
    );
  }, [
    files, systemResults, selectedLibrary, selectedLibraryId, selectedSourceId,
    selectedAccountId, selectedFolderId, selectedCategory, searchQuery,
    disconnectedAccountIds, starredOnly, dateFilter, sortKey, sortDirection,
  ]);

  // Include Spotlight hits so inspector / Quick Look work for system search results.
  const selectedFile =
    files.find(f => f.id === selectedFileId)
    || filteredFiles.find(f => f.id === selectedFileId)
    || null;

  const photoFiles = useMemo(
    () => filteredFiles.filter(f => f.category === 'photo'),
    [filteredFiles],
  );
  const photoIndex = selectedFile?.category === 'photo' ? photoFiles.findIndex(f => f.id === selectedFile.id) : -1;
  const photoNav: PhotoNav | null =
    photoIndex >= 0 && photoFiles.length > 1
      ? {
          hasPrev: photoIndex > 0,
          hasNext: photoIndex < photoFiles.length - 1,
          onPrev: () => setSelectedFileId(photoFiles[photoIndex - 1].id),
          onNext: () => setSelectedFileId(photoFiles[photoIndex + 1].id),
        }
      : null;

  const folderPhotos = editingPhotoFile
    ? files.filter(item => item.category === 'photo' && (
        editingPhotoFile.folderId
          ? item.folderId === editingPhotoFile.folderId
          : item.folderPath === editingPhotoFile.folderPath
      ))
    : [];
  const folderPhotoIndex = editingPhotoFile ? folderPhotos.findIndex(item => item.id === editingPhotoFile.id) : -1;
  const openFolderPhoto = (index: number) => {
    const next = folderPhotos[index];
    if (!next) return;
    void openPhotoFile(next);
  };
  const editorPhotoNav: PhotoNav | null = folderPhotoIndex >= 0
    ? {
        hasPrev: folderPhotoIndex > 0,
        hasNext: folderPhotoIndex < folderPhotos.length - 1,
        onPrev: () => openFolderPhoto(folderPhotoIndex - 1),
        onNext: () => openFolderPhoto(folderPhotoIndex + 1),
      }
    : null;

  // Video navigation for playback controls
  const videoFiles = useMemo(
    () => filteredFiles.filter(f => f.category === 'video'),
    [filteredFiles],
  );
  const videoIndex = playingVideoFile ? videoFiles.findIndex(f => f.id === playingVideoFile.id) : -1;
  const canPreviousMedia = videoIndex > 0;
  const canNextMedia = videoIndex >= 0 && videoIndex < videoFiles.length - 1;
  const playVideoAt = (index: number) => {
    const next = videoFiles[index];
    if (!next) return;
    setSelectedFileId(next.id);
    setPlayingVideoFile(next);
  };
  const nextVideoFile = canNextMedia ? videoFiles[videoIndex + 1] ?? null : null;
  const onPreviousMedia = () => playVideoAt(videoIndex - 1);
  const onNextMedia = () => playVideoAt(videoIndex + 1);

  const {
    isDraggingOver,
    handleSavePhotoVersion, handleSaveDocument, handleSaveTrimmedVideo, handleToggleEncrypt, handleDeleteFile,
    handleRenameFile, handleDuplicateFiles, handleCopyFileNames, handlePasteFiles,
    handleMoveFile, handleCompressFile, handleCompressFiles, clipboardFileIds, handleToggleTag,
    handleBatchRestore, handleBatchDelete, handleUploadFiles, handleUnzipFile, handleDragOver, handleDragLeave, handleDrop,
  } = useFileActions({
    files,
    setFiles,
    selectedFileId,
    setSelectedFileId,
    selectedAccountId,
    selectedFolder,
    showToast,
    isVaultUnlocked,
  });

  // Active path title
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeSourceName = selectedSourceId
    ? networkServers.find(s => s.id === selectedSourceId)?.name ?? removableDevices.find(d => d.id === selectedSourceId)?.name
    : undefined;
  const activePathTitle = activeSourceName
    ? activeSourceName
    : selectedLibrary
    ? selectedLibrary.name
    : selectedFolder
    ? selectedFolder.name
    : selectedAccountId === 'all'
    ? 'All Files'
    : selectedAccountId === 'vault'
    ? 'Private Vault'
    : activeAccount?.name || 'Cloud Bucket';

  const navLocation = useMemo<NavLocation>(() => ({
    accountId: selectedAccountId,
    folderId: selectedFolderId,
    libraryId: selectedLibraryId,
    sourceId: selectedSourceId,
    category: selectedCategory,
  }), [selectedAccountId, selectedFolderId, selectedLibraryId, selectedSourceId, selectedCategory]);

  const applyNavLocation = useCallback((location: NavLocation) => {
    setSelectedAccountId(location.accountId);
    setSelectedFolderId(location.folderId);
    setSelectedLibraryId(location.libraryId);
    setSelectedSourceId(location.sourceId);
    setSelectedCategory(location.category);
  }, []);

  const { canGoBack, canGoForward, goBack, goForward } = useNavHistory(navLocation, applyNavLocation);

  const collectDescendantFolderIds = useCallback((rootId: string): Set<string> => {
    const ids = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of folders) {
        if (!folder.parentId || ids.has(folder.id)) continue;
        if (ids.has(folder.parentId)) {
          ids.add(folder.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [folders]);

  const handleRenameFolder = useCallback(async (folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const diskPath = localPathFromFolderId(folder.id);
    if (diskPath && localFs.available()) {
      try {
        const info = await localFs.rename(diskPath, trimmed);
        const newId = `folder-local-${info.path}`;
        setFolders(prev => prev.map(f => {
          if (f.id === folderId) return { ...f, id: newId, name: info.name };
          if (f.parentId === folderId) return { ...f, parentId: newId };
          return f;
        }));
        setFiles(prev => prev.map(f => (
          f.folderId === folderId
            ? {
                ...f,
                folderId: newId,
                folderPath: f.folderPath.replace(folder.name, info.name),
                localPath: f.localPath?.startsWith(diskPath)
                  ? `${info.path}${f.localPath.slice(diskPath.length)}`
                  : f.localPath,
              }
            : f
        )));
        if (selectedFolderId === folderId) setSelectedFolderId(newId);
        showToast(`Renamed to “${info.name}”`);
      } catch (err) {
        showToast(`Could not rename: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    setFolders(prev => prev.map(f => (f.id === folderId ? { ...f, name: trimmed } : f)));
  }, [folders, selectedFolderId, showToast]);

  const handleDuplicateFolders = useCallback((sources: FolderItem[]) => {
    setFolders(prev => {
      const names = new Set(prev.map(f => f.name));
      const copies: FolderItem[] = [];
      for (const folder of sources) {
        let name = `${folder.name} copy`;
        if (names.has(name)) {
          let n = 2;
          while (names.has(`${folder.name} copy ${n}`)) n += 1;
          name = `${folder.name} copy ${n}`;
        }
        names.add(name);
        copies.push({
          ...folder,
          id: `folder-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          tags: [...(folder.tags ?? [])],
          itemCount: 0,
        });
      }
      if (!copies.length) return prev;
      const insertAt = Math.max(0, ...sources.map(source => prev.findIndex(f => f.id === source.id)));
      const next = [...prev];
      next.splice(insertAt + 1, 0, ...copies);
      return next;
    });
    showToast(sources.length === 1 ? `Duplicated “${sources[0].name}”` : `Duplicated ${sources.length} folders`);
  }, [showToast]);

  const handleCopyFolders = useCallback(async (sources: FolderItem[]) => {
    const text = sources.map(folder => folder.name).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
    showToast(sources.length === 1 ? `Copied “${sources[0].name}”` : `Copied ${sources.length} folders`);
  }, [showToast]);

  const handleDeleteFolders = useCallback(async (sources: FolderItem[]) => {
    if (!sources.length) return;
    const label = sources.length === 1 ? `“${sources[0].name}”` : `${sources.length} folders`;
    if (!window.confirm(`Move ${label} to the Trash?`)) return;

    const removeIds = new Set<string>();
    for (const folder of sources) {
      for (const id of collectDescendantFolderIds(folder.id)) removeIds.add(id);
    }

    for (const folder of sources) {
      const diskPath = localPathFromFolderId(folder.id);
      if (diskPath && localFs.available()) {
        try {
          await localFs.trashFile(diskPath);
        } catch (err) {
          showToast(`Could not trash “${folder.name}”: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      } else if (diskPath === null && localFs.available()) {
        // Tracked local root without an absolute id — forget by display name match later via forget if remembered.
      }
    }

    setFolders(prev => prev.filter(f => !removeIds.has(f.id)));
    setFiles(prev => prev.filter(f => !f.folderId || !removeIds.has(f.folderId)));
    if (selectedFolderId && removeIds.has(selectedFolderId)) setSelectedFolderId(null);
    showToast(sources.length === 1 ? `Moved “${sources[0].name}” to the Trash` : `Moved ${sources.length} folders to the Trash`);
  }, [collectDescendantFolderIds, selectedFolderId, showToast]);

  const handleToggleFolderTag = useCallback((folderIds: string[], tag: string) => {
    const idSet = new Set(folderIds);
    setFolders(prev => prev.map(folder => {
      if (!idSet.has(folder.id)) return folder;
      const tags = folder.tags ?? [];
      const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
      return { ...folder, tags: next };
    }));
  }, []);

  return (
    <div 
      className="relative flex flex-col h-screen w-screen overflow-hidden select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: 'radial-gradient(circle at 15% 15%, #3b3c40 0%, #242426 45%, #171719 100%)',
      }}
    >
      
      {/* Ambient Liquid Glass Glowing Lights in Background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-white/[0.04] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] rounded-full bg-white/[0.035] blur-[140px] pointer-events-none" />
      <div className="absolute top-2/3 left-1/3 w-80 h-80 rounded-full bg-white/[0.03] blur-[100px] pointer-events-none" />

      {isDraggingOver && <DropOverlay />}

      {toastNotification && <Toast message={toastNotification} />}

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files?.length) handleUploadFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Full App Window Panel */}
      <div className="flex-1 p-0 overflow-hidden flex flex-col z-10 w-full h-full">
        <div className="relative w-full h-full max-w-none rounded-none border-x-0 border-b-0 overflow-hidden flex flex-col macos-window">

          {/* macOS Finder Toolbar & Titlebar */}
          <MacFinderToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            systemSearching={systemSearching}
            systemSearchActive={searchQuery.trim().length >= 2}
            selectedCategory={selectedCategory}
            onCategoryChange={cat => {
              setSelectedCategory(cat);
              if (cat === 'files' || cat === 'photo' || cat === 'video') {
                setSelectedSourceId(null);
                setSelectedLibraryId(null);
                setSelectedFolderId(null);
                setSelectedAccountId('all');
              }
            }}
            starredOnly={starredOnly}
            onStarredOnlyChange={setStarredOnly}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
            onQuickLook={() => setIsQuickLookOpen(true)}
            hasSelectedFile={selectedFile !== null}
            onShare={() => {
              const firstLib = sharedLibraries[0];
              if (firstLib) setSharingLibrary(firstLib);
            }}
            onUploadFiles={handleUploadFiles}
            onOpenAddAccount={() => setIsAddAccountOpen(true)}
            activePathTitle={activePathTitle}
            activeAccount={activeAccount}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={goBack}
            onGoForward={goForward}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
            isInspectorOpen={isInspectorOpen}
            sidePanelMode={sidePanelMode}
            onToggleInspector={() => {
              if (isInspectorOpen && sidePanelMode === 'inspector') {
                setIsInspectorOpen(false);
              } else {
                setSidePanelMode('inspector');
                setIsInspectorOpen(true);
              }
            }}
            onShowTerminal={() => {
              if (isInspectorOpen && sidePanelMode === 'terminal') {
                setIsInspectorOpen(false);
              } else {
                setSidePanelMode('terminal');
                setIsInspectorOpen(true);
              }
            }}
            isNotificationOpen={isNotificationOpen}
            onToggleNotifications={() => setIsNotificationOpen(prev => !prev)}
            onCloseNotifications={() => setIsNotificationOpen(false)}
            notifications={notifications}
            onAcceptLibrary={handleAcceptLibraryNotification}
            onDeclineLibrary={handleDeclineLibraryNotification}
            onMarkAllAsRead={handleMarkAllNotificationsRead}
            onClearNotification={handleClearNotification}
            onSelectLibrary={libId => {
              setSelectedSourceId(null);
              setSelectedLibraryId(libId);
              setSelectedFolderId(null);
            }}
          />

          {/* Center Pane: Sidebar + File Explorer View + Inspector Drawer */}
          <div className="flex flex-1 overflow-hidden relative">
            
            {/* macOS Finder Sidebar */}
            <Sidebar
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelectAccount={selectAccount}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={selectFolder}
              sharedLibraries={sharedLibraries}
              selectedLibraryId={selectedLibraryId}
              onSelectLibrary={selectLibrary}
              onOpenAddAccount={() => setIsAddAccountOpen(true)}
              onOpenVaultSecurity={() => setIsVaultSecurityOpen(true)}
              onOpenProfileSettings={() => setIsProfileSettingsOpen(true)}
              onOpenAccountSettings={acc => setIntegratingAccount(acc)}
              userProfile={userProfile}
              onOpenShareModal={lib => setSharingLibrary(lib)}
              isVaultUnlocked={isVaultUnlocked}
              compact={appPreferences.compactSidebar}
              width={sidebarWidth}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
              onAddFavorite={() => setIsAddFavoriteOpen(true)}
              onAddNewFolder={handleAddLocalFolderFromDisk}
              onRescanLocalFolders={handleRescanLocalFolders}
              isRescanningLocal={isRescanningLocal}
              onAddNewIncomingLibrary={() => setIsJoinIncomingOpen(true)}
              onAddNewOutgoingLibrary={() => setIsNewLibraryOpen(true)}
              onAddNewSharedLibrary={() => setIsNewLibraryOpen(true)}
              onAddNetworkServer={() => setIsConnectServerOpen(true)}
              customFavorites={customFavorites}
              networkServers={networkServers}
              removableDevices={removableDevices}
              onEjectDevice={handleEjectDevice}
              onSelectRemovableDevice={handleSelectRemovableDevice}
              selectedRemovableDeviceId={selectedSourceId}
              onSelectNetworkServer={handleSelectNetworkServer}
              selectedNetworkServerId={selectedSourceId}
              swarmStatus={swarmStatus}
              selectedSourceId={selectedSourceId}
              onSelectFavoriteSource={openSource}
            />

            {/* Sidebar Draggable Splitter Handle */}
            {!isSidebarCollapsed && (
              <div
                onMouseDown={startResizeSidebar}
                onDoubleClick={resetSidebarWidth}
                className={`w-1.5 -ml-1 z-30 cursor-col-resize hover:bg-sky-400/60 transition-colors select-none shrink-0 group ${
                  isResizingSidebar ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-transparent'
                }`}
                title="Drag to resize sidebar (Double-click to reset)"
              >
                <div className="w-0.5 h-6 mx-auto mt-2 rounded bg-white/20 group-hover:bg-sky-300 transition-colors" />
              </div>
            )}

            {/* Central File Explorer — document editor replaces the browser pane when open */}
            {editingDocumentFile ? (
              <DocumentEditorModal
                key={editingDocumentFile.id}
                file={editingDocumentFile}
                isOpen={true}
                embedded
                onClose={() => setEditingDocumentFile(null)}
                onSave={updated => {
                  handleSaveDocument(updated);
                  setEditingDocumentFile(updated);
                }}
              />
            ) : (
              <FileBrowser
                files={filteredFiles}
                selectedSourceId={selectedSourceId}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                selectedFolder={selectedFolder}
                selectedLibrary={selectedLibrary}
                selectedCategory={selectedCategory}
                selectedFileId={selectedFileId}
                viewMode={viewMode}
                playingAudioFile={playingAudioFile}
                audioPlaylist={files.filter(f => f.category === 'audio')}
                onSelectFile={file => openFileSelection(file)}
                onEditPhoto={file => { void openPhotoFile(file); }}
                onOpenDocument={file => { void openDocumentFile(file); }}
                onOpenVideo={async file => {
                  openFileSelection(file);
                  setPlayingAudioFile(null);
                  if (file.tags.includes('P2P') && file.encryption?.algorithm === 'AES-256-GCM') {
                    const lib = sharedLibraries.find(l => l.fileIds.includes(file.id));
                    if (lib) {
                      try {
                        showToast('Decrypting P2P stream…');
                        const blob = await p2pBridge.assembleFileBlob(lib.id, file.id, file.mimeType);
                        const url = URL.createObjectURL(blob);
                        setPlayingVideoFile({ ...file, url });
                        return;
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : String(err));
                      }
                    }
                  }
                  setPlayingVideoFile(file);
                }}
                onOpenAudio={file => {
                  setPlayingVideoFile(null);
                  openFileSelection(file);
                  setPlayingAudioFile(file);
                }}
                onCloseAudio={() => setPlayingAudioFile(null)}
                onShareFile={file => {
                  const firstLib = sharedLibraries[0];
                  if (firstLib) setSharingLibrary(firstLib);
                }}
                onToggleEncrypt={handleToggleEncrypt}
                onDeleteFile={handleDeleteFile}
                onBatchRestore={handleBatchRestore}
                onBatchDelete={handleBatchDelete}
                onRenameFile={handleRenameFile}
                onDuplicateFiles={handleDuplicateFiles}
                onCopyFiles={handleCopyFileNames}
                onToggleTag={handleToggleTag}
                onUnzipFile={file => { void handleUnzipFile(file); }}
                onOpenQuickLook={() => setIsQuickLookOpen(true)}
                folders={folders}
                onSelectFolder={id => {
                  if (selectedCategory === 'files' || selectedCategory === 'photo' || selectedCategory === 'video') {
                    setSelectedCategory('all');
                onCompressFiles={items => { void handleCompressFiles(items); }}
                  }
                  selectFolder(id);
                }}
                onRenameFolder={(id, name) => { void handleRenameFolder(id, name); }}
                onDuplicateFolders={handleDuplicateFolders}
                onCopyFolders={foldersToCopy => { void handleCopyFolders(foldersToCopy); }}
                onDeleteFolders={foldersToDelete => { void handleDeleteFolders(foldersToDelete); }}
                onToggleFolderTag={handleToggleFolderTag}
                onShareFolder={() => {
                  const firstLib = sharedLibraries[0];
                  if (firstLib) setSharingLibrary(firstLib);
                  else showToast('Create a P2P library to share');
                }}
                swarmStatus={swarmStatus}
                onCopyLibraryInvite={() => { void copyLibraryInvite(); }}
                onRefreshSwarm={() => { void refreshSwarm(); }}
                hugContent={columnsInspectorLayout}
                systemSearchActive={searchQuery.trim().length >= 2 && systemSearchBridge.available()}
                systemSearching={systemSearching}
                systemHitCount={systemResults.length}
              />
            )}

            {/* Spacer so Columns view keeps equal-width panes while the inspector sits on the right. */}
            {columnsInspectorLayout && <div className="flex-1 min-w-4" aria-hidden="true" />}

            {/* Right panel stays visible on every file screen (browser + document editor) */}
            {isInspectorOpen && (
              <div
                onMouseDown={startResizeInspector}
                onDoubleClick={resetInspectorWidth}
                className={`w-1.5 -mr-1 z-30 cursor-col-resize hover:bg-sky-400/60 transition-colors select-none shrink-0 group ${
                  isResizingInspector ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-transparent'
                }`}
                title="Drag to resize side panel (Double-click to reset)"
              >
                <div className="w-0.5 h-6 mx-auto mt-2 rounded bg-white/20 group-hover:bg-sky-300 transition-colors" />
              </div>
            )}

            {isInspectorOpen && sidePanelMode === 'terminal' && (
              <SystemTerminal
                width={inspectorWidth}
                context={{
                  cwdLabel: activePathTitle || 'All Files',
                  userName: userProfile.name,
                  isVaultUnlocked,
                  peerId: swarmStatus?.peerId ?? null,
                  fileNames: filteredFiles.map(f => sanitizeContextLabel(f.name)),
                  libraryNames: sharedLibraries.map(l => sanitizeContextLabel(l.name)),
                }}
              />
            )}

            {isInspectorOpen && sidePanelMode === 'inspector' && (
              <FileInspector
                file={selectedFile ?? editingDocumentFile}
                photoNav={photoNav}
                accounts={accounts}
                folders={folders}
                isOpen={true}
                onEditPhoto={file => { void openPhotoFile(file); }}
                onOpenDocument={file => { void openDocumentFile(file); }}
                onOpenVideo={(file, tab) => {
                  openFileSelection(file);
                  setPlayingAudioFile(null);
                  setPlayingVideoFile(file);
                  if (tab) setVideoPlayerInitialTab(tab);
                }}
                onOpenAudio={file => {
                  setPlayingVideoFile(null);
                  openFileSelection(file);
                  setPlayingAudioFile(file);
                }}
                onShare={file => {
                  const firstLib = sharedLibraries[0];
                  if (firstLib) setSharingLibrary(firstLib);
                }}
                onToggleEncrypt={handleToggleEncrypt}
                onDeleteFile={handleDeleteFile}
                onUnzipFile={file => { void handleUnzipFile(file); }}
                onCopyFile={file => { void handleCopyFileNames([file]); }}
                onPasteFiles={() => {
                  const target = selectedFile ?? editingDocumentFile;
                  if (!target) return;
                  handlePasteFiles({
                    folderId: target.folderId,
                    folderPath: target.folderPath,
                    accountId: target.accountId,
                  });
                }}
                onRenameFile={handleRenameFile}
                onMoveFile={handleMoveFile}
                onCompressFile={handleCompressFile}
                onNewFolder={() => setIsNewFolderOpen(true)}
                canPaste={clipboardFileIds.length > 0}
                width={inspectorWidth}
              />
            )}
          </div>

        </div>
      </div>

      {pendingUntrustedOpen && (
        <UntrustedContentGate
          isOpen
          fileName={pendingUntrustedOpen.file.name}
          report={pendingUntrustedOpen.report}
          onConfirm={confirmUntrustedOpen}
          onDeny={denyUntrustedOpen}
        />
      )}

      <AppModals
        selectedFile={selectedFile}
        photoNav={photoNav}
        editorPhotoNav={editorPhotoNav}
        accounts={accounts}
        folders={folders}
        isQuickLookOpen={isQuickLookOpen}
        setIsQuickLookOpen={setIsQuickLookOpen}
        setEditingPhotoFile={setEditingPhotoFile}
        onEditPhoto={file => { void openPhotoFile(file); }}
        setPlayingVideoFile={setPlayingVideoFile}
        sharedLibraries={sharedLibraries}
        setSharingLibrary={setSharingLibrary}
        editingPhotoFile={editingPhotoFile}
        onOpenDocument={file => { void openDocumentFile(file); }}
        handleSavePhotoVersion={handleSavePhotoVersion}
        playingVideoFile={playingVideoFile}
        handleSaveTrimmedVideo={handleSaveTrimmedVideo}
        videoPlayerInitialTab={videoPlayerInitialTab}
        canPreviousMedia={canPreviousMedia}
        canNextMedia={canNextMedia}
        nextVideoFile={nextVideoFile}
        onPreviousMedia={onPreviousMedia}
        onNextMedia={onNextMedia}
        sharingLibrary={sharingLibrary}
        setSharedLibraries={setSharedLibraries}
        selectedLibraryId={selectedLibraryId}
        setSelectedLibraryId={setSelectedLibraryId}
        isVaultSecurityOpen={isVaultSecurityOpen}
        setIsVaultSecurityOpen={setIsVaultSecurityOpen}
        isVaultUnlocked={isVaultUnlocked}
        handleToggleVaultLock={handleToggleVaultLock}
        isProfileSettingsOpen={isProfileSettingsOpen}
        setIsProfileSettingsOpen={setIsProfileSettingsOpen}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        appPreferences={appPreferences}
        setAppPreferences={setAppPreferences}
        peerId={swarmStatus?.peerId ?? null}
        swarmListening={swarmStatus?.listening ?? false}
        p2pLibraryCount={sharedLibraries.length}
        onCheckForUpdates={handleCheckForUpdates}
        updateChecking={updateChecking}
        appVersion={appVersion}
        showToast={showToast}
        isAddAccountOpen={isAddAccountOpen}
        setIsAddAccountOpen={setIsAddAccountOpen}
        setAccounts={setAccounts}
        setSelectedAccountId={setSelectedAccountId}
        onMountCloudAccount={handleMountCloudAccount}
        onSyncCloudLibrary={handleSyncCloudLibrary}
        integratingAccount={integratingAccount}
        setIntegratingAccount={setIntegratingAccount}
        isNewFolderOpen={isNewFolderOpen}
        setIsNewFolderOpen={setIsNewFolderOpen}
        handleCreateFolder={handleCreateFolder}
        isNewLibraryOpen={isNewLibraryOpen}
        setIsNewLibraryOpen={setIsNewLibraryOpen}
        handleCreateLibrary={handleCreateLibrary}
        isJoinIncomingOpen={isJoinIncomingOpen}
        setIsJoinIncomingOpen={setIsJoinIncomingOpen}
        handleJoinIncomingLibrary={handleJoinIncomingLibrary}
        isAddFavoriteOpen={isAddFavoriteOpen}
        setIsAddFavoriteOpen={setIsAddFavoriteOpen}
        networkServers={networkServers}
        removableDevices={removableDevices}
        favoritedSourceIds={favoritedSourceIds}
        onBrowseFavoriteFolder={handleBrowseFavoriteFolder}
        onAddFavoriteNetwork={handleAddFavoriteNetwork}
        onAddFavoriteDevice={handleAddFavoriteDevice}
        isConnectServerOpen={isConnectServerOpen}
        setIsConnectServerOpen={setIsConnectServerOpen}
        handleAddNetworkServer={handleAddNetworkServer}
        handleDisconnectAccount={handleDisconnectAccount}
      />

    </div>
  );
}
