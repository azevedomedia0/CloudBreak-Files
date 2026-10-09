/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MacFinderToolbar, MacViewMode } from './components/MacFinderToolbar';
import { Sidebar } from './components/Sidebar';
import { useResizablePanel } from './hooks/useResizablePanel';
import { DateFilter, FileSortDirection, FileSortKey, filterFiles, sortFiles } from './utils/filterFiles';
import { useToast } from './hooks/useToast';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useFileActions } from './hooks/useFileActions';
import { useVault } from './hooks/useVault';
import { useP2pLibraries } from './hooks/useP2pLibraries';
import { useCloudAccounts } from './hooks/useCloudAccounts';
import { useNotifications } from './hooks/useNotifications';
import { useSidebarSources } from './hooks/useSidebarSources';
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
import {
  AppPreferences,
  applyTheme,
  loadPreferences,
  loadProfile,
  savePreferences,
  saveProfile,
} from './utils/appPreferences';
import { p2pBridge } from './services/p2pBridge';

export default function App() {
  // Accounts & Navigation States
  const [selectedAccountId, setSelectedAccountId] = useState<CloudProviderId>('all');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  // A network share (by name) or removable device (by id) opened from the sidebar's Network section
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
  const [playingVideoFile, setPlayingVideoFile] = useState<FileItem | null>(null);
  const [playingAudioFile, setPlayingAudioFile] = useState<FileItem | null>(null);
  const [videoPlayerInitialTab, setVideoPlayerInitialTab] = useState<'player' | 'trim' | 'convert'>('player');
  const [sharingLibrary, setSharingLibrary] = useState<SharedLibrary | null>(null);
  const [isVaultSecurityOpen, setIsVaultSecurityOpen] = useState<boolean>(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState<boolean>(false);
  const [userProfile, setUserProfileState] = useState<UserProfile>(() => loadProfile());
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [integratingAccount, setIntegratingAccount] = useState<CloudAccount | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() => loadPreferences().showInspectorOnLaunch);
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
    setIsInspectorOpen(prefs.showInspectorOnLaunch);
  };

  // Resizable sidebar & inspector widths
  const { width: sidebarWidth, isResizing: isResizingSidebar, startResize: startResizeSidebar, reset: resetSidebarWidth } =
    useResizablePanel({ initial: 240, min: 180, max: 380, grow: 'right' });
  const { width: inspectorWidth, isResizing: isResizingInspector, startResize: startResizeInspector, reset: resetInspectorWidth } =
    useResizablePanel({ initial: 320, min: 260, max: () => Math.max(480, Math.round(window.innerWidth * 0.65)), grow: 'left' });

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

  useGlobalShortcuts({
    canQuickLook: !!selectedFileId && !editingPhotoFile && !editingDocumentFile && !playingVideoFile && !playingAudioFile && !sharingLibrary,
    onToggleSidebar: () => setIsSidebarCollapsed(prev => !prev),
    onToggleQuickLook: () => setIsQuickLookOpen(prev => !prev),
  });

  const {
    removableDevices, customFavorites, networkServers, favoritedSourceIds,
    handleCreateFolder, handleAddLocalFolderFromDisk, handleBrowseFavoriteFolder,
    handleAddNetworkServer, selectAccount, selectFolder, selectLibrary, openSource,
    handleAddFavoriteNetwork, handleAddFavoriteDevice, handleEjectDevice,
  } = useSidebarSources({
    folders, files, selectedAccountId, selectedFolderId, selectedSourceId, isVaultUnlocked,
    setFolders, setFiles, setSelectedAccountId, setSelectedFolderId, setSelectedLibraryId,
    setSelectedSourceId, setSelectedFileId, setIsVaultSecurityOpen, showToast,
  });

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
    files,
    setFiles,
    selectedFileId,
    setSelectedFileId,
    selectedAccountId,
    selectedFolder,
    showToast,
    confirmBeforeDelete: appPreferences.confirmBeforeDelete,
    isVaultUnlocked,
  });

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
    ? 'All Files'
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
                  playingAudioFile={playingAudioFile}
                  audioPlaylist={files.filter(f => f.category === 'audio')}
                  onSelectFile={file => setSelectedFileId(file.id)}
                  onEditPhoto={file => setEditingPhotoFile(file)}
                  onOpenDocument={file => setEditingDocumentFile(file)}
                  onOpenVideo={async file => {
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
                    setSelectedFileId(file.id);
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
                    }
                    selectFolder(id);
                  }}
                  swarmStatus={swarmStatus}
                  onCopyLibraryInvite={() => { void copyLibraryInvite(); }}
                  onRefreshSwarm={() => { void refreshSwarm(); }}
                />

                {/* Right panel: File Inspector or System Terminal */}
                {isInspectorOpen && (sidePanelMode === 'terminal' || selectedFile) && (
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
                      fileNames: filteredFiles.map(f => f.name),
                      libraryNames: sharedLibraries.map(l => l.name),
                    }}
                  />
                )}

                {isInspectorOpen && sidePanelMode === 'inspector' && selectedFile && (
                  <FileInspector
                    file={selectedFile}
                    photoNav={photoNav}
                    accounts={accounts}
                    folders={folders}
                    isOpen={true}
                    onEditPhoto={file => setEditingPhotoFile(file)}
                    onOpenDocument={file => setEditingDocumentFile(file)}
                    onOpenVideo={(file, tab) => {
                      setPlayingAudioFile(null);
                      setPlayingVideoFile(file);
                      if (tab) setVideoPlayerInitialTab(tab);
                    }}
                    onOpenAudio={file => {
                      setPlayingVideoFile(null);
                      setSelectedFileId(file.id);
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
                    onPasteFiles={() => handlePasteFiles({
                      folderId: selectedFile.folderId,
                      folderPath: selectedFile.folderPath,
                      accountId: selectedFile.accountId,
                    })}
                    onRenameFile={handleRenameFile}
                    onMoveFile={handleMoveFile}
                    onCompressFile={handleCompressFile}
                    onNewFolder={() => setIsNewFolderOpen(true)}
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
