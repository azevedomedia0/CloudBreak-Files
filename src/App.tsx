/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MacFinderToolbar, MacViewMode } from './components/MacFinderToolbar';
import { Sidebar } from './components/Sidebar';
import { rustBridge } from './services/rustBridge';
import { useResizablePanel } from './hooks/useResizablePanel';
import { buildLibraryFromNotification } from './utils/libraryBuilders';
import type { SwarmStatus } from './services/p2pBridge';
import { DateFilter, FileSortDirection, FileSortKey, filterFiles, sortFiles } from './utils/filterFiles';
import { useToast } from './hooks/useToast';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useFileActions } from './hooks/useFileActions';
import { AppModals } from './components/AppModals';
import { PhotoNav } from './components/PhotoNavArrows';
import { UserProfile } from './components/ProfileSettingsModal';
import { DropOverlay } from './components/DropOverlay';
import { Toast } from './components/Toast';
import { FileBrowser } from './components/FileBrowser';
import { FileInspector } from './components/FileInspector';
import { DocumentEditorModal } from './components/document-editor/DocumentEditorModal';

import {
  CloudAccount, FileItem, FolderItem, SharedLibrary, SharedMember,
  CloudProviderId, FileCategory, AppNotification, RemovableDevice, FavoriteShortcut,
} from './types';
import {
  INITIAL_ACCOUNTS, INITIAL_FOLDERS, INITIAL_FILES, INITIAL_SHARED_LIBRARIES,
  INITIAL_NOTIFICATIONS, INITIAL_REMOVABLE_DEVICES
} from './utils/sampleData';
import {
  AppPreferences,
  loadPreferences,
  loadProfile,
  savePreferences,
  saveProfile,
} from './utils/appPreferences';
import { cloudService } from './services/cloud';
import { pickLocalFolderFromDisk } from './utils/importLocalFolder';
import { p2pBridge, recordToSharedLibrary } from './services/p2pBridge';
import type { CreateP2pLibraryForm, JoinP2pLibraryForm } from './components/SidebarModals';
import type { MountedCloudResult } from './components/AddAccountModal';
import type { CloudSyncPayload } from './components/CloudProviderIntegrationModal';

export default function App() {
  // Accounts & Navigation States
  const [accounts, setAccounts] = useState<CloudAccount[]>(INITIAL_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState<CloudProviderId>('all');
  const [disconnectedAccountIds, setDisconnectedAccountIds] = useState<ReadonlySet<string>>(new Set());
  const [folders, setFolders] = useState<FolderItem[]>(INITIAL_FOLDERS);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sharedLibraries, setSharedLibraries] = useState<SharedLibrary[]>(INITIAL_SHARED_LIBRARIES);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  // A network share (by name) or removable device (by id) opened from the sidebar's Network section
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [removableDevices, setRemovableDevices] = useState<RemovableDevice[]>(INITIAL_REMOVABLE_DEVICES);

  // Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);

  // Sidebar dynamic items & modals
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState<boolean>(false);
  const [isNewLibraryOpen, setIsNewLibraryOpen] = useState<boolean>(false);
  const [isJoinIncomingOpen, setIsJoinIncomingOpen] = useState<boolean>(false);
  const [isAddFavoriteOpen, setIsAddFavoriteOpen] = useState<boolean>(false);
  const [isConnectServerOpen, setIsConnectServerOpen] = useState<boolean>(false);
  const [customFavorites, setCustomFavorites] = useState<FavoriteShortcut[]>([]);
  const [networkServers, setNetworkServers] = useState<Array<{ name: string; desc: string; icon?: any; online: boolean }>>([
    { name: 'Studio NAS (10GbE SMB)', desc: '192.168.1.100', online: true },
    { name: 'Render Farm Cluster', desc: 'Node 01-08', online: true },
    { name: 'Cloudbreak P2P Relay', desc: 'Direct encrypted', online: true },
    { name: 'Edge Gateway (Cloud Relay)', desc: 'Direct encrypted proxy', online: true },
  ]);

  // Files State
  const [files, setFiles] = useState<FileItem[]>(INITIAL_FILES);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(INITIAL_FILES[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');
  const [sortKey, setSortKey] = useState<FileSortKey>('name');
  const [sortDirection, setSortDirection] = useState<FileSortDirection>('asc');
  const [appPreferences, setAppPreferencesState] = useState<AppPreferences>(() => loadPreferences());
  const [viewMode, setViewMode] = useState<MacViewMode>(() => loadPreferences().defaultView);

  // Vault E2EE State
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);

  // Modals & Panels
  const [isQuickLookOpen, setIsQuickLookOpen] = useState<boolean>(false);
  const [editingPhotoFile, setEditingPhotoFile] = useState<FileItem | null>(null);
  const [editingDocumentFile, setEditingDocumentFile] = useState<FileItem | null>(null);
  const [playingVideoFile, setPlayingVideoFile] = useState<FileItem | null>(null);
  const [videoPlayerInitialTab, setVideoPlayerInitialTab] = useState<'player' | 'trim' | 'convert'>('player');
  const [sharingLibrary, setSharingLibrary] = useState<SharedLibrary | null>(null);
  const [isVaultSecurityOpen, setIsVaultSecurityOpen] = useState<boolean>(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState<boolean>(false);
  const [userProfile, setUserProfileState] = useState<UserProfile>(() => loadProfile());
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [integratingAccount, setIntegratingAccount] = useState<CloudAccount | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() => loadPreferences().showInspectorOnLaunch);

  const setUserProfile = (profile: UserProfile) => {
    setUserProfileState(profile);
    saveProfile(profile);
  };

  const setAppPreferences = (prefs: AppPreferences) => {
    setAppPreferencesState(prefs);
    savePreferences(prefs);
    setViewMode(prefs.defaultView);
    setIsInspectorOpen(prefs.showInspectorOnLaunch);
  };

  // Resizable sidebar & inspector widths
  const { width: sidebarWidth, isResizing: isResizingSidebar, startResize: startResizeSidebar, reset: resetSidebarWidth } =
    useResizablePanel({ initial: 240, min: 180, max: 380, grow: 'right' });
  const { width: inspectorWidth, isResizing: isResizingInspector, startResize: startResizeInspector, reset: resetInspectorWidth } =
    useResizablePanel({ initial: 320, min: 260, max: () => Math.max(480, Math.round(window.innerWidth * 0.65)), grow: 'left' });

  const { toast: toastNotification, showToast } = useToast();
  const [swarmStatus, setSwarmStatus] = useState<SwarmStatus | null>(null);

  useEffect(() => {
    setAccounts(prev => prev.map(account => (
      cloudService.hasCredentials(account.id)
        ? { ...account, liveConnected: true }
        : account
    )));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await p2pBridge.getIdentity(userProfile.name);
        const records = await p2pBridge.listLibraries();
        if (cancelled) return;
        if (records.length) {
          setSharedLibraries(prev => {
            const byId = new Map(prev.map(l => [l.id, l]));
            for (const rec of records) {
              byId.set(rec.libraryId, recordToSharedLibrary(rec));
            }
            return [...byId.values()];
          });
          // Resume seeding for outgoing libraries so the tray status dot goes green.
          for (const rec of records) {
            if (rec.direction === 'outgoing' && rec.isSeeding) {
              try {
                await p2pBridge.startSeeding(rec.libraryId);
              } catch {
                // ignore per-library resume failures
              }
            }
          }
        }
        const status = await p2pBridge.swarmStatus();
        if (!cancelled) setSwarmStatus(status);
        try {
          await p2pBridge.refreshTrayStatus();
        } catch {
          // Browser preview has no tray
        }
      } catch {
        // Browser / first launch — identity created on first seed/join
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile.name]);

  const refreshSwarm = async () => {
    try {
      if (selectedLibraryId) {
        await p2pBridge.startSeeding(selectedLibraryId);
      }
      const status = await p2pBridge.swarmStatus();
      setSwarmStatus(status);
      showToast(
        status.listening
          ? `Private swarm listening · invite-dial only · ${status.peers.filter(p => p.connected).length} peer(s)`
          : `Private mode · ${status.seedingRootCids.length} root(s) seeding (no DHT)`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const copyLibraryInvite = async () => {
    if (!selectedLibraryId) return;
    try {
      const invite = await p2pBridge.exportInvite(selectedLibraryId);
      await navigator.clipboard.writeText(invite);
      showToast('P2P invite copied to clipboard');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleVaultLock = async (unlocked: boolean, passphrase?: string) => {
    try {
      if (unlocked) {
        await rustBridge.unlockVault(passphrase ?? '');
      } else {
        await rustBridge.lockVault();
      }
      setIsVaultUnlocked(unlocked);
      if (appPreferences.securityAlerts) {
        showToast(unlocked ? 'Vault Decrypted' : 'Vault Locked & Encrypted');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  // Apply reduce-motion preference to the document root
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', appPreferences.reduceMotion);
  }, [appPreferences.reduceMotion]);

  // Auto-lock vault after idle timeout
  useEffect(() => {
    if (!isVaultUnlocked || appPreferences.autoLockMinutes <= 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ms = appPreferences.autoLockMinutes * 60 * 1000;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          try {
            await rustBridge.lockVault();
            setIsVaultUnlocked(false);
            if (appPreferences.securityAlerts) {
              showToast('Vault auto-locked after idle timeout');
            }
          } catch {
            // ignore
          }
        })();
      }, ms);
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'mousemove', 'wheel'];
    arm();
    for (const ev of events) window.addEventListener(ev, arm, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, arm);
    };
  }, [isVaultUnlocked, appPreferences.autoLockMinutes, appPreferences.securityAlerts, showToast]);

  useGlobalShortcuts({
    canQuickLook: !!selectedFileId && !editingPhotoFile && !editingDocumentFile && !playingVideoFile && !sharingLibrary,
    onToggleSidebar: () => setIsSidebarCollapsed(prev => !prev),
    onToggleQuickLook: () => setIsQuickLookOpen(prev => !prev),
  });

  // Sidebar Action Handlers
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

  const handleCreateLibrary = async (form: CreateP2pLibraryForm) => {
    await p2pBridge.getIdentity(userProfile.name);
    const selected = files.filter(f => f.id === selectedFileId).slice(0, 1);
    const payloadFiles = [];
    for (const f of selected) {
      try {
        const res = await fetch(f.url);
        const buf = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        buf.forEach(b => { binary += String.fromCharCode(b); });
        payloadFiles.push({
          name: f.name,
          mimeType: f.mimeType,
          contentBase64: btoa(binary),
        });
      } catch {
        // skip unreadable sample URLs
      }
    }
    if (!payloadFiles.length) {
      const note = `Cloudbreak P2P library: ${form.name}\n${form.description}\n`;
      payloadFiles.push({
        name: 'LIBRARY.txt',
        mimeType: 'text/plain',
        contentBase64: btoa(note),
      });
    }
    const result = await p2pBridge.createLibrary({
      name: form.name,
      description: form.description,
      role: form.role,
      recipientEmail: form.memberEmail || undefined,
      invitePassphrase: form.invitePassphrase.length >= 8 ? form.invitePassphrase : undefined,
      bandwidthCap: form.bandwidthCap,
      files: payloadFiles,
    });
    const newLib = recordToSharedLibrary(result.record);
    if (form.memberEmail) {
      newLib.members = [
        ...newLib.members,
        {
          id: `m-${Date.now()}`,
          name: form.memberEmail.split('@')[0],
          email: form.memberEmail,
          role: form.role,
          status: 'pending',
        },
      ];
      newLib.seedingPeers = [{
        id: `p-${Date.now()}`,
        name: form.memberEmail.split('@')[0],
        email: form.memberEmail,
        peerNodeId: result.record.ownerPeerId,
        status: 'seeding',
        role: form.role,
      }];
    }
    setSharedLibraries(prev => [...prev.filter(l => l.id !== newLib.id), newLib]);
    setSelectedLibraryId(newLib.id);
    try {
      await navigator.clipboard.writeText(result.invite);
      showToast(`Seeding “${form.name}” — invite copied to clipboard`);
    } catch {
      showToast(`Seeding “${form.name}” — export invite from Share`);
    }
  };

  const handleJoinIncomingLibrary = async (form: JoinP2pLibraryForm) => {
    await p2pBridge.getIdentity(userProfile.name);
    const result = await p2pBridge.acceptInvite(
      form.invite,
      form.passphrase || undefined,
    );
    let newLib = recordToSharedLibrary(result.record);
    if (form.name) newLib = { ...newLib, name: form.name };
    if (form.ownerName) {
      newLib = {
        ...newLib,
        ownerName: form.ownerName,
        senderPeerName: form.ownerName,
      };
    }
    setSharedLibraries(prev => [...prev.filter(l => l.id !== newLib.id), newLib]);
    setSelectedLibraryId(newLib.id);

    // Materialize decrypted files into the browser file list when available
    try {
      const manifest = await p2pBridge.fetchManifest(newLib.id);
      const imported: FileItem[] = [];
      for (const entry of manifest.files) {
        try {
          const decrypted = await p2pBridge.readFile(newLib.id, entry.fileId);
          const bytes = Uint8Array.from(atob(decrypted.contentBase64), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: decrypted.mimeType || entry.mimeType });
          const url = URL.createObjectURL(blob);
          imported.push({
            id: entry.fileId,
            name: form.name ? `${entry.name}` : decrypted.name || entry.name,
            folderPath: `/P2P/${newLib.name}`,
            accountId: 'all',
            sizeBytes: decrypted.sizeBytes,
            category: entry.mimeType.startsWith('image/')
              ? 'photo'
              : entry.mimeType.startsWith('video/')
                ? 'video'
                : entry.mimeType.startsWith('audio/')
                  ? 'audio'
                  : 'document',
            mimeType: decrypted.mimeType || entry.mimeType,
            updatedAt: new Date().toISOString(),
            url,
            thumbnailUrl: entry.mimeType.startsWith('image/') ? url : undefined,
            tags: ['P2P', 'E2EE'],
            encryption: {
              isEncrypted: true,
              algorithm: 'AES-256-GCM',
              keyFingerprint: 'P2P library key',
              checksumSha256: entry.plaintextSha256 || 'verified',
              zeroKnowledgeVerified: true,
            },
            version: 1,
          });
        } catch {
          // chunk not local yet
        }
      }
      if (imported.length) {
        setFiles(prev => [...imported, ...prev]);
        newLib = { ...newLib, fileIds: imported.map(f => f.id) };
        setSharedLibraries(prev => prev.map(l => (l.id === newLib.id ? newLib : l)));
        setSelectedFileId(imported[0].id);
      }
    } catch {
      // manifest may arrive after swarm sync
    }

    showToast(
      result.fetchedChunks > 0
        ? `Connected “${newLib.name}” · ${result.fetchedChunks} chunk(s) fetched`
        : `Connected “${newLib.name}” — waiting for seeder chunks`,
    );
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

  const applyCloudLibrary = (accountId: CloudProviderId, library: { folders: FolderItem[]; files: FileItem[] }) => {
    setFolders(prev => [
      ...prev.filter(folder => folder.accountId !== accountId),
      ...library.folders,
    ]);
    setFiles(prev => [
      ...prev.filter(file => file.accountId !== accountId),
      ...library.files,
    ]);
  };

  const handleMountCloudAccount = (result: MountedCloudResult) => {
    const { account, folders: remoteFolders, files: remoteFiles, note } = result;
    setDisconnectedAccountIds(prev => {
      const next = new Set(prev);
      next.delete(account.id);
      return next;
    });
    setAccounts(prev => {
      const without = prev.filter(a => a.id !== account.id);
      return [...without, account];
    });
    applyCloudLibrary(account.id, { folders: remoteFolders, files: remoteFiles });
    setSelectedAccountId(account.id);
    setSelectedFolderId(null);
    setSelectedLibraryId(null);
    setSelectedSourceId(null);
    showToast(note || `Mounted ${account.name} · ${remoteFiles.length} files`);
  };

  const handleSyncCloudLibrary = (payload: CloudSyncPayload) => {
    setAccounts(prev => prev.map(a => a.id === payload.account.id ? payload.account : a));
    applyCloudLibrary(payload.account.id, {
      folders: payload.folders,
      files: payload.files,
    });
    if (payload.note) showToast(payload.note);
  };

  const handleDisconnectAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    cloudService.disconnect(accountId as CloudProviderId);
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    setFolders(prev => prev.filter(folder => folder.accountId !== accountId));
    setFiles(prev => prev.filter(file => file.accountId !== accountId));
    setDisconnectedAccountIds(prev => new Set(prev).add(accountId));

    if (selectedAccountId === accountId) {
      setSelectedAccountId('all');
      setSelectedFolderId(null);
      setSelectedLibraryId(null);
      setSelectedSourceId(null);
    }
    const selected = files.find(f => f.id === selectedFileId);
    if (selected?.accountId === accountId) setSelectedFileId(null);

    showToast(`Disconnected ${account.name}. Your files stay in the provider.`);
  };

  // Notification Action Handlers
  const handleAcceptLibraryNotification = (notificationId: string) => {
    const notif = notifications.find(n => n.id === notificationId);
    if (!notif || notif.type !== 'incoming_library' || !notif.libraryData || !notif.sender) return;

    const newLib = buildLibraryFromNotification(notif);
    setSharedLibraries(prev => [newLib, ...prev]);
    setSelectedLibraryId(newLib.id);
    setSelectedFolderId(null);

    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, read: true, status: 'accepted' as const }
          : n
      )
    );

    showToast(`Accepted incoming P2P library "${notif.libraryData.name}"`);
  };

  const handleDeclineLibraryNotification = (notificationId: string) => {
    const notif = notifications.find(n => n.id === notificationId);
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, read: true, status: 'declined' as const }
          : n
      )
    );
    showToast(notif ? `Declined invitation for "${notif.libraryData?.name || notif.title}"` : 'Declined invitation');
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('All notifications marked as read');
  };

  const handleClearNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  // Selected file and folder objects
  const selectedFile = files.find(f => f.id === selectedFileId) || null;
  const selectedFolder = folders.find(f => f.id === selectedFolderId) || null;
  const selectedLibrary = sharedLibraries.find(lib => lib.id === selectedLibraryId) || null;

  // Filter files
  const filteredFiles = sortFiles(
    filterFiles(files, {
      selectedLibrary, selectedLibraryId, selectedSourceId, selectedAccountId, selectedFolderId,
      selectedCategory, searchQuery, disconnectedAccountIds, starredOnly, dateFilter,
    }),
    sortKey,
    sortDirection,
  );

  const photoFiles = filteredFiles.filter(f => f.category === 'photo');
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
    setSelectedFileId(next.id);
    setEditingPhotoFile(next);
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
  const videoFiles = filteredFiles.filter(f => f.category === 'video');
  const videoIndex = playingVideoFile ? videoFiles.findIndex(f => f.id === playingVideoFile.id) : -1;
  const canPreviousMedia = videoIndex > 0;
  const canNextMedia = videoIndex >= 0 && videoIndex < videoFiles.length - 1;
  const playVideoAt = (index: number) => {
    const next = videoFiles[index];
    if (!next) return;
    setSelectedFileId(next.id);
    setPlayingVideoFile(next);
  };
  const onPreviousMedia = () => playVideoAt(videoIndex - 1);
  const onNextMedia = () => playVideoAt(videoIndex + 1);

  const {
    isDraggingOver,
    handleSavePhotoVersion, handleSaveDocument, handleSaveTrimmedVideo, handleToggleEncrypt, handleDeleteFile,
    handleRenameFile, handleDuplicateFiles, handleCopyFileNames, handlePasteFiles,
    handleMoveFile, handleCompressFile, clipboardFileIds, handleToggleTag,
    handleBatchRestore, handleBatchDelete, handleUploadFiles, handleUnzipFile, handleDragOver, handleDragLeave, handleDrop,
  } = useFileActions({
    setFiles,
    selectedFileId,
    setSelectedFileId,
    selectedAccountId,
    selectedFolder,
    showToast,
    confirmBeforeDelete: appPreferences.confirmBeforeDelete,
  });

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

  // Active path title
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeSourceName = selectedSourceId
    ? networkServers.find(s => s.name === selectedSourceId)?.name ?? removableDevices.find(d => d.id === selectedSourceId)?.name
    : undefined;
  const activePathTitle = activeSourceName
    ? activeSourceName
    : selectedLibrary
    ? selectedLibrary.name
    : selectedFolder
    ? selectedFolder.name
    : selectedAccountId === 'all'
    ? 'All Cloud Vaults'
    : selectedAccountId === 'vault'
    ? 'Private Vault'
    : activeAccount?.name || 'Cloud Bucket';

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

      {/* Full App Window Panel */}
      <div className="flex-1 p-0 overflow-hidden flex flex-col z-10 w-full h-full">
        <div className="relative w-full h-full max-w-none rounded-none border-x-0 border-b-0 overflow-hidden flex flex-col macos-window">
          
          {/* macOS Finder Toolbar & Titlebar */}
          <MacFinderToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
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
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
            isInspectorOpen={isInspectorOpen}
            onToggleInspector={() => setIsInspectorOpen(prev => !prev)}
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
              onAddNewIncomingLibrary={() => setIsJoinIncomingOpen(true)}
              onAddNewOutgoingLibrary={() => setIsNewLibraryOpen(true)}
              onAddNewSharedLibrary={() => setIsNewLibraryOpen(true)}
              onAddNetworkServer={() => setIsConnectServerOpen(true)}
              customFavorites={customFavorites}
              networkServers={networkServers}
              removableDevices={removableDevices}
              onEjectDevice={handleEjectDevice}
              onSelectRemovableDevice={device => openSource(device.id)}
              selectedRemovableDeviceId={selectedSourceId}
              onSelectNetworkServer={openSource}
              selectedNetworkServerName={selectedSourceId}
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

            {/* Central File Explorer — document editor replaces this pane when open */}
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
              <>
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
                  onSelectFile={file => setSelectedFileId(file.id)}
                  onEditPhoto={file => setEditingPhotoFile(file)}
                  onOpenDocument={file => setEditingDocumentFile(file)}
                  onOpenVideo={async file => {
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
                    }
                    selectFolder(id);
                  }}
                  swarmStatus={swarmStatus}
                  onCopyLibraryInvite={() => { void copyLibraryInvite(); }}
                  onRefreshSwarm={() => { void refreshSwarm(); }}
                />

                {/* Inspector Draggable Splitter Handle */}
                {isInspectorOpen && selectedFile && (
                  <div
                    onMouseDown={startResizeInspector}
                    onDoubleClick={resetInspectorWidth}
                    className={`w-1.5 -mr-1 z-30 cursor-col-resize hover:bg-sky-400/60 transition-colors select-none shrink-0 group ${
                      isResizingInspector ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-transparent'
                    }`}
                    title="Drag to resize file inspector (Double-click to reset)"
                  >
                    <div className="w-0.5 h-6 mx-auto mt-2 rounded bg-white/20 group-hover:bg-sky-300 transition-colors" />
                  </div>
                )}

                {/* Right File Inspector */}
                {isInspectorOpen && selectedFile && (
                  <FileInspector
                    file={selectedFile}
                    photoNav={photoNav}
                    accounts={accounts}
                    folders={folders}
                    isOpen={true}
                    onEditPhoto={file => setEditingPhotoFile(file)}
                    onOpenDocument={file => setEditingDocumentFile(file)}
                    onOpenVideo={(file, tab) => {
                      setPlayingVideoFile(file);
                      if (tab) setVideoPlayerInitialTab(tab);
                    }}
                    onShare={file => {
                      const firstLib = sharedLibraries[0];
                      if (firstLib) setSharingLibrary(firstLib);
                    }}
                    onToggleEncrypt={handleToggleEncrypt}
                    onDeleteFile={handleDeleteFile}
                    onUnzipFile={file => { void handleUnzipFile(file); }}
                    onCopyFile={file => { void handleCopyFileNames([file]); }}
                    onPasteFiles={() => handlePasteFiles({
                      folderId: selectedFile.folderId,
                      folderPath: selectedFile.folderPath,
                      accountId: selectedFile.accountId,
                    })}
                    onRenameFile={handleRenameFile}
                    onMoveFile={handleMoveFile}
                    onCompressFile={handleCompressFile}
                    canPaste={clipboardFileIds.length > 0}
                    width={inspectorWidth}
                  />
                )}
              </>
            )}
          </div>

        </div>
      </div>

      <AppModals
        selectedFile={selectedFile}
        photoNav={photoNav}
        editorPhotoNav={editorPhotoNav}
        accounts={accounts}
        folders={folders}
        isQuickLookOpen={isQuickLookOpen}
        setIsQuickLookOpen={setIsQuickLookOpen}
        setEditingPhotoFile={setEditingPhotoFile}
        setPlayingVideoFile={setPlayingVideoFile}
        sharedLibraries={sharedLibraries}
        setSharingLibrary={setSharingLibrary}
        editingPhotoFile={editingPhotoFile}
        onOpenDocument={file => setEditingDocumentFile(file)}
        handleSavePhotoVersion={handleSavePhotoVersion}
        playingVideoFile={playingVideoFile}
        handleSaveTrimmedVideo={handleSaveTrimmedVideo}
        videoPlayerInitialTab={videoPlayerInitialTab}
        canPreviousMedia={canPreviousMedia}
        canNextMedia={canNextMedia}
        onPreviousMedia={onPreviousMedia}
        onNextMedia={onNextMedia}
        sharingLibrary={sharingLibrary}
        setSharedLibraries={setSharedLibraries}
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
