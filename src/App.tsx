/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MacFinderToolbar, MacViewMode } from './components/MacFinderToolbar';
import { Sidebar } from './components/Sidebar';
import { rustBridge } from './services/rustBridge';
import { useResizablePanel } from './hooks/useResizablePanel';
import { buildOutgoingLibrary, buildIncomingLibrary, buildLibraryFromNotification } from './utils/libraryBuilders';
import { filterFiles } from './utils/filterFiles';
import { useToast } from './hooks/useToast';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useFileActions } from './hooks/useFileActions';
import { AppModals } from './components/AppModals';
import { UserProfile } from './components/ProfileSettingsModal';
import { DropOverlay } from './components/DropOverlay';
import { Toast } from './components/Toast';
import { FileBrowser } from './components/FileBrowser';
import { FileInspector } from './components/FileInspector';

import {
  CloudAccount, FileItem, FolderItem, SharedLibrary, SharedMember,
  CloudProviderId, FileCategory, AppNotification 
} from './types';
import {
  INITIAL_ACCOUNTS, INITIAL_FOLDERS, INITIAL_FILES, INITIAL_SHARED_LIBRARIES,
  INITIAL_NOTIFICATIONS
} from './utils/sampleData';

export default function App() {
  // Accounts & Navigation States
  const [accounts, setAccounts] = useState<CloudAccount[]>(INITIAL_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState<CloudProviderId>('all');
  const [folders, setFolders] = useState<FolderItem[]>(INITIAL_FOLDERS);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sharedLibraries, setSharedLibraries] = useState<SharedLibrary[]>(INITIAL_SHARED_LIBRARIES);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);

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
  const [customFavorites, setCustomFavorites] = useState<Array<{ id: string; name: string }>>([]);
  const [networkServers, setNetworkServers] = useState<Array<{ name: string; desc: string; icon?: any; online: boolean }>>([
    { name: 'Studio NAS (10GbE SMB)', desc: '192.168.1.100', online: true },
    { name: 'Render Farm Cluster', desc: 'Node 01-08', online: true },
    { name: 'Aether P2P Relay', desc: 'Direct encrypted', online: true },
    { name: 'Edge Gateway (Cloud Relay)', desc: 'Direct encrypted proxy', online: true },
  ]);

  // Files State
  const [files, setFiles] = useState<FileItem[]>(INITIAL_FILES);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(INITIAL_FILES[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>('all');
  const [viewMode, setViewMode] = useState<MacViewMode>('icons');

  // Vault E2EE State
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);

  // Modals & Panels
  const [isQuickLookOpen, setIsQuickLookOpen] = useState<boolean>(false);
  const [editingPhotoFile, setEditingPhotoFile] = useState<FileItem | null>(null);
  const [playingVideoFile, setPlayingVideoFile] = useState<FileItem | null>(null);
  const [videoPlayerInitialTab, setVideoPlayerInitialTab] = useState<'player' | 'trim' | 'convert'>('player');
  const [sharingLibrary, setSharingLibrary] = useState<SharedLibrary | null>(null);
  const [isVaultSecurityOpen, setIsVaultSecurityOpen] = useState<boolean>(true);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Steven Azevedo',
    email: 'you@example.com',
    role: 'Sovereign Vault Administrator',
  });
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [integratingAccount, setIntegratingAccount] = useState<CloudAccount | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(true);

  // Resizable sidebar & inspector widths
  const { width: sidebarWidth, isResizing: isResizingSidebar, startResize: startResizeSidebar, reset: resetSidebarWidth } =
    useResizablePanel({ initial: 240, min: 180, max: 380, grow: 'right' });
  const { width: inspectorWidth, isResizing: isResizingInspector, startResize: startResizeInspector, reset: resetInspectorWidth } =
    useResizablePanel({ initial: 320, min: 260, max: 480, grow: 'left' });

  const { toast: toastNotification, showToast } = useToast();

  const handleToggleVaultLock = async (unlocked: boolean, passphrase?: string) => {
    try {
      if (unlocked) {
        await rustBridge.unlockVault(passphrase ?? '');
      } else {
        await rustBridge.lockVault();
      }
      setIsVaultUnlocked(unlocked);
      showToast(unlocked ? 'Vault Decrypted' : 'Vault Locked & Encrypted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  useGlobalShortcuts({
    canQuickLook: !!selectedFileId && !editingPhotoFile && !playingVideoFile && !sharingLibrary,
    onToggleSidebar: () => setIsSidebarCollapsed(prev => !prev),
    onToggleQuickLook: () => setIsQuickLookOpen(prev => !prev),
  });

  // Sidebar Action Handlers
  const handleCreateFolder = (name: string, category: string) => {
    const newId = `folder-${Date.now()}`;
    const newFolder: FolderItem = {
      id: newId,
      name,
      accountId: selectedAccountId === 'all' ? 'gdrive' : selectedAccountId,
      itemCount: 0,
      color: category === 'vault' ? 'emerald' : 'sky',
    };
    setFolders(prev => [...prev, newFolder]);
    setSelectedFolderId(newId);
    showToast(`Created folder "${name}"`);
  };

  const handleCreateLibrary = (name: string, description: string, memberEmail: string, role: 'viewer' | 'editor' | 'admin') => {
    const newLib = buildOutgoingLibrary({
      name,
      description,
      memberEmail,
      role,
      accountId: selectedAccountId === 'all' ? 's3' : selectedAccountId,
    });
    setSharedLibraries(prev => [...prev, newLib]);
    setSelectedLibraryId(newLib.id);
    showToast(`Seeding "${name}" to specified P2P peer users`);
  };

  const handleJoinIncomingLibrary = (name: string, inviteUrlOrCode: string, ownerName: string) => {
    const newLib = buildIncomingLibrary(name, ownerName);
    setSharedLibraries(prev => [...prev, newLib]);
    setSelectedLibraryId(newLib.id);
    showToast(`Connected incoming P2P library "${name}" from ${ownerName}`);
  };

  const handleAddFavorite = (name: string) => {
    const newFav = { id: `fav-${Date.now()}`, name };
    setCustomFavorites(prev => [...prev, newFav]);
    showToast(`Added "${name}" to Favorites`);
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

  const handleDisconnectAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      showToast(`Disconnected ${account.name} from AetherCloud`);
    }
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
  const filteredFiles = filterFiles(files, { selectedLibrary, selectedLibraryId, selectedAccountId, selectedFolderId, selectedCategory, searchQuery });

  const {
    isDraggingOver,
    handleSavePhotoVersion, handleSaveTrimmedVideo, handleToggleEncrypt, handleDeleteFile,
    handleBatchEncrypt, handleBatchDelete, handleUploadFiles, handleDragOver, handleDragLeave, handleDrop,
  } = useFileActions({ setFiles, selectedFileId, setSelectedFileId, selectedAccountId, selectedFolder, showToast });

  // Active path title
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activePathTitle = selectedLibrary
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
        background: 'radial-gradient(circle at 15% 15%, #182848 0%, #0c101c 45%, #05070c 100%)',
      }}
    >
      
      {/* Ambient Liquid Glass Glowing Lights in Background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] rounded-full bg-indigo-600/15 blur-[140px] pointer-events-none" />
      <div className="absolute top-2/3 left-1/3 w-80 h-80 rounded-full bg-sky-500/10 blur-[100px] pointer-events-none" />

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
            onCategoryChange={setSelectedCategory}
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
            isNotificationOpen={isNotificationOpen}
            onToggleNotifications={() => setIsNotificationOpen(prev => !prev)}
            onCloseNotifications={() => setIsNotificationOpen(false)}
            notifications={notifications}
            onAcceptLibrary={handleAcceptLibraryNotification}
            onDeclineLibrary={handleDeclineLibraryNotification}
            onMarkAllAsRead={handleMarkAllNotificationsRead}
            onClearNotification={handleClearNotification}
            onSelectLibrary={libId => {
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
              onSelectAccount={setSelectedAccountId}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              sharedLibraries={sharedLibraries}
              selectedLibraryId={selectedLibraryId}
              onSelectLibrary={setSelectedLibraryId}
              onOpenAddAccount={() => setIsAddAccountOpen(true)}
              onOpenVaultSecurity={() => setIsVaultSecurityOpen(true)}
              onOpenProfileSettings={() => setIsProfileSettingsOpen(true)}
              onOpenAccountSettings={acc => setIntegratingAccount(acc)}
              userProfile={userProfile}
              onOpenShareModal={lib => setSharingLibrary(lib)}
              isVaultUnlocked={isVaultUnlocked}
              width={sidebarWidth}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
              onAddFavorite={() => setIsAddFavoriteOpen(true)}
              onAddNewFolder={() => setIsNewFolderOpen(true)}
              onAddNewIncomingLibrary={() => setIsJoinIncomingOpen(true)}
              onAddNewOutgoingLibrary={() => setIsNewLibraryOpen(true)}
              onAddNewSharedLibrary={() => setIsNewLibraryOpen(true)}
              onAddNetworkServer={() => setIsConnectServerOpen(true)}
              customFavorites={customFavorites}
              networkServers={networkServers}
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

            {/* Central File Explorer with 4 macOS view modes */}
            <FileBrowser
              files={filteredFiles}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              selectedFolder={selectedFolder}
              selectedLibrary={selectedLibrary}
              selectedFileId={selectedFileId}
              viewMode={viewMode}
              onSelectFile={file => setSelectedFileId(file.id)}
              onEditPhoto={file => setEditingPhotoFile(file)}
              onOpenVideo={file => setPlayingVideoFile(file)}
              onShareFile={file => {
                const firstLib = sharedLibraries[0];
                if (firstLib) setSharingLibrary(firstLib);
              }}
              onToggleEncrypt={handleToggleEncrypt}
              onDeleteFile={handleDeleteFile}
              onBatchEncrypt={handleBatchEncrypt}
              onBatchDelete={handleBatchDelete}
              onOpenQuickLook={() => setIsQuickLookOpen(true)}
              folders={folders}
              onSelectFolder={setSelectedFolderId}
            />

            {/* Inspector Draggable Splitter Handle */}
            {viewMode !== 'columns' && isInspectorOpen && selectedFile && (
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

            {/* Right File Inspector (only in Icons / List / Gallery mode when open) */}
            {viewMode !== 'columns' && isInspectorOpen && selectedFile && (
              <FileInspector
                file={selectedFile}
                accounts={accounts}
                isOpen={true}
                onClose={() => setIsInspectorOpen(false)}
                onEditPhoto={file => setEditingPhotoFile(file)}
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
                width={inspectorWidth}
              />
            )}
          </div>

        </div>
      </div>

      <AppModals
        selectedFile={selectedFile}
        accounts={accounts}
        isQuickLookOpen={isQuickLookOpen}
        setIsQuickLookOpen={setIsQuickLookOpen}
        setEditingPhotoFile={setEditingPhotoFile}
        setPlayingVideoFile={setPlayingVideoFile}
        sharedLibraries={sharedLibraries}
        setSharingLibrary={setSharingLibrary}
        editingPhotoFile={editingPhotoFile}
        handleSavePhotoVersion={handleSavePhotoVersion}
        playingVideoFile={playingVideoFile}
        handleSaveTrimmedVideo={handleSaveTrimmedVideo}
        videoPlayerInitialTab={videoPlayerInitialTab}
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
        showToast={showToast}
        isAddAccountOpen={isAddAccountOpen}
        setIsAddAccountOpen={setIsAddAccountOpen}
        setAccounts={setAccounts}
        setSelectedAccountId={setSelectedAccountId}
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
        handleAddFavorite={handleAddFavorite}
        isConnectServerOpen={isConnectServerOpen}
        setIsConnectServerOpen={setIsConnectServerOpen}
        handleAddNetworkServer={handleAddNetworkServer}
        handleDisconnectAccount={handleDisconnectAccount}
      />

    </div>
  );
}
