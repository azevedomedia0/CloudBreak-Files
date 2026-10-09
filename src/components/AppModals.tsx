import React from 'react';
import { CloudAccount, CloudProviderId, FileItem, FolderItem, RemovableDevice, SharedLibrary } from '../types';
import { QuickLookModal } from './QuickLookModal';
import { PhotoNav } from './PhotoNavArrows';
import { PhotoEditorModal } from './PhotoEditorModal';
import { VideoPlayerModal } from './VideoPlayerModal';
import { ShareLibraryModal } from './ShareLibraryModal';
import { VaultSecurityModal } from './VaultSecurityModal';
import { ProfileSettingsModal, UserProfile } from './ProfileSettingsModal';
import type { AppPreferences } from '../utils/appPreferences';
import { AddAccountModal, MountedCloudResult } from './AddAccountModal';
import { CloudProviderIntegrationModal, CloudSyncPayload } from './CloudProviderIntegrationModal';
import {
  NewFolderModal, NewSharedLibraryModal, AddFavoriteModal, ConnectServerModal, JoinIncomingLibraryModal,
  CreateP2pLibraryForm, JoinP2pLibraryForm,
} from './SidebarModals';

export interface AppModalsProps {
  selectedFile: FileItem | null;
  photoNav: PhotoNav | null;
  editorPhotoNav?: PhotoNav | null;
  accounts: CloudAccount[];
  folders: FolderItem[];
  isQuickLookOpen: boolean;
  setIsQuickLookOpen: (open: boolean) => void;
  setEditingPhotoFile: (file: FileItem | null) => void;
  setPlayingVideoFile: (file: FileItem | null) => void;
  sharedLibraries: SharedLibrary[];
  setSharingLibrary: (library: SharedLibrary | null) => void;
  editingPhotoFile: FileItem | null;
  onOpenDocument: (file: FileItem) => void;
  handleSavePhotoVersion: (file: FileItem, dataUrl: string) => void;
  playingVideoFile: FileItem | null;
  handleSaveTrimmedVideo: (file: FileItem) => void;
  videoPlayerInitialTab: 'player' | 'trim' | 'convert';
  canPreviousMedia?: boolean;
  canNextMedia?: boolean;
  onPreviousMedia?: () => void;
  onNextMedia?: () => void;
  sharingLibrary: SharedLibrary | null;
  setSharedLibraries: React.Dispatch<React.SetStateAction<SharedLibrary[]>>;
  selectedLibraryId?: string | null;
  setSelectedLibraryId?: (id: string | null) => void;
  isVaultSecurityOpen: boolean;
  setIsVaultSecurityOpen: (open: boolean) => void;
  isVaultUnlocked: boolean;
  handleToggleVaultLock: (unlocked: boolean, passphrase?: string) => Promise<void>;
  isProfileSettingsOpen: boolean;
  setIsProfileSettingsOpen: (open: boolean) => void;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  appPreferences: AppPreferences;
  setAppPreferences: (prefs: AppPreferences) => void;
  peerId?: string | null;
  swarmListening?: boolean;
  p2pLibraryCount?: number;
  onCheckForUpdates?: () => void | Promise<void>;
  updateChecking?: boolean;
  appVersion?: string | null;
  showToast: (msg: string) => void;
  isAddAccountOpen: boolean;
  setIsAddAccountOpen: (open: boolean) => void;
  setAccounts: React.Dispatch<React.SetStateAction<CloudAccount[]>>;
  setSelectedAccountId: (id: CloudProviderId) => void;
  onMountCloudAccount: (result: MountedCloudResult) => void;
  onSyncCloudLibrary: (payload: CloudSyncPayload) => void;
  integratingAccount: CloudAccount | null;
  setIntegratingAccount: (account: CloudAccount | null) => void;
  isNewFolderOpen: boolean;
  setIsNewFolderOpen: (open: boolean) => void;
  handleCreateFolder: (name: string, category: string) => void;
  isNewLibraryOpen: boolean;
  setIsNewLibraryOpen: (open: boolean) => void;
  handleCreateLibrary: (form: CreateP2pLibraryForm) => void | Promise<void>;
  isJoinIncomingOpen: boolean;
  setIsJoinIncomingOpen: (open: boolean) => void;
  handleJoinIncomingLibrary: (form: JoinP2pLibraryForm) => void | Promise<void>;
  isAddFavoriteOpen: boolean;
  setIsAddFavoriteOpen: (open: boolean) => void;
  networkServers: Array<{ id: string; name: string; desc: string; online: boolean }>;
  removableDevices: RemovableDevice[];
  favoritedSourceIds: ReadonlySet<string>;
  onBrowseFavoriteFolder: () => Promise<boolean>;
  onAddFavoriteNetwork: (serverId: string) => void;
  onAddFavoriteDevice: (deviceId: string) => void;
  isConnectServerOpen: boolean;
  setIsConnectServerOpen: (open: boolean) => void;
  handleAddNetworkServer: (name: string, address: string, protocol: string) => void;
  handleDisconnectAccount: (accountId: string) => void;
}

/** Every modal the app can open. Each one renders nothing while it is closed. */
export const AppModals: React.FC<AppModalsProps> = ({
  selectedFile,
  photoNav,
  editorPhotoNav = null,
  accounts,
  folders,
  isQuickLookOpen,
  setIsQuickLookOpen,
  setEditingPhotoFile,
  setPlayingVideoFile,
  sharedLibraries,
  setSharingLibrary,
  editingPhotoFile,
  onOpenDocument,
  handleSavePhotoVersion,
  playingVideoFile,
  handleSaveTrimmedVideo,
  videoPlayerInitialTab,
  canPreviousMedia,
  canNextMedia,
  onPreviousMedia,
  onNextMedia,
  sharingLibrary,
  setSharedLibraries,
  selectedLibraryId = null,
  setSelectedLibraryId,
  isVaultSecurityOpen,
  setIsVaultSecurityOpen,
  isVaultUnlocked,
  handleToggleVaultLock,
  isProfileSettingsOpen,
  setIsProfileSettingsOpen,
  userProfile,
  setUserProfile,
  appPreferences,
  setAppPreferences,
  peerId = null,
  swarmListening = false,
  p2pLibraryCount = 0,
  onCheckForUpdates,
  updateChecking = false,
  appVersion = null,
  showToast,
  isAddAccountOpen,
  setIsAddAccountOpen,
  setAccounts,
  setSelectedAccountId,
  onMountCloudAccount,
  onSyncCloudLibrary,
  integratingAccount,
  setIntegratingAccount,
  isNewFolderOpen,
  setIsNewFolderOpen,
  handleCreateFolder,
  isNewLibraryOpen,
  setIsNewLibraryOpen,
  handleCreateLibrary,
  isJoinIncomingOpen,
  setIsJoinIncomingOpen,
  handleJoinIncomingLibrary,
  isAddFavoriteOpen,
  setIsAddFavoriteOpen,
  networkServers,
  removableDevices,
  favoritedSourceIds,
  onBrowseFavoriteFolder,
  onAddFavoriteNetwork,
  onAddFavoriteDevice,
  isConnectServerOpen,
  setIsConnectServerOpen,
  handleAddNetworkServer,
  handleDisconnectAccount,
}) => (
  <>
  {/* macOS Quick Look Preview Modal (Spacebar) */}
  <QuickLookModal
    file={selectedFile}
    accounts={accounts}
    isOpen={isQuickLookOpen}
    onClose={() => setIsQuickLookOpen(false)}
    onEditPhoto={file => setEditingPhotoFile(file)}
    onOpenDocument={file => {
      setIsQuickLookOpen(false);
      onOpenDocument(file);
    }}
    onOpenVideo={file => setPlayingVideoFile(file)}
    onShare={file => {
      const firstLib = sharedLibraries[0];
      if (firstLib) setSharingLibrary(firstLib);
    }}
    photoNav={photoNav}
  />

  {/* Modal 1: In-Browser Photo Studio */}
  {editingPhotoFile && (
    <PhotoEditorModal
      file={editingPhotoFile}
      isOpen={true}
      onClose={() => setEditingPhotoFile(null)}
      onSaveAsVersion={handleSavePhotoVersion}
      photoNav={editorPhotoNav}
    />
  )}

  {/* Modal 2: Cinema Video Player, Trimmer & Converter */}
  {playingVideoFile && (
    <VideoPlayerModal
      key={playingVideoFile.id}
      file={playingVideoFile}
      isOpen={true}
      onClose={() => setPlayingVideoFile(null)}
      onSaveTrimmedVideo={handleSaveTrimmedVideo}
      initialTab={videoPlayerInitialTab}
      accounts={accounts}
      folders={folders}
      canPreviousMedia={canPreviousMedia}
      canNextMedia={canNextMedia}
      onPreviousMedia={onPreviousMedia}
      onNextMedia={onNextMedia}
    />
  )}

  {/* Modal 3: Collaborative Shared Media Library Management */}
  {sharingLibrary && (
    <ShareLibraryModal
      library={sharingLibrary}
      isOpen={true}
      onClose={() => setSharingLibrary(null)}
      onUpdateLibrary={updated => {
        setSharedLibraries(prev => prev.map(l => l.id === updated.id ? updated : l));
        setSharingLibrary(updated);
      }}
      onDisconnectLibrary={id => {
        setSharedLibraries(prev => prev.filter(l => l.id !== id));
        if (selectedLibraryId === id) setSelectedLibraryId?.(null);
        setSharingLibrary(null);
        showToast('Disconnected from incoming library');
      }}
    />
  )}

  {/* Modal 4: Vault Security & Cryptography Key Manager */}
  <VaultSecurityModal
    isOpen={isVaultSecurityOpen}
    onClose={() => setIsVaultSecurityOpen(false)}
    isVaultUnlocked={isVaultUnlocked}
    onToggleVaultLock={handleToggleVaultLock}
  />

  {/* Modal 4.1: Profile & App Settings */}
  <ProfileSettingsModal
    isOpen={isProfileSettingsOpen}
    onClose={() => setIsProfileSettingsOpen(false)}
    userProfile={userProfile}
    onUpdateProfile={updated => {
      setUserProfile(updated);
    }}
    preferences={appPreferences}
    onUpdatePreferences={setAppPreferences}
    accounts={accounts}
    isVaultUnlocked={isVaultUnlocked}
    onToggleVaultLock={handleToggleVaultLock}
    onShowToast={showToast}
    peerId={peerId}
    swarmListening={swarmListening}
    p2pLibraryCount={p2pLibraryCount}
    onCheckForUpdates={onCheckForUpdates}
    updateChecking={updateChecking}
    appVersion={appVersion}
  />

  {/* Modal 5: Connect / Mount New Cloud Account */}
  <AddAccountModal
    isOpen={isAddAccountOpen}
    onClose={() => setIsAddAccountOpen(false)}
    onAddAccount={onMountCloudAccount}
  />

  {/* Modal 5.1: Cloud Provider Integration & Settings */}
  {integratingAccount && (
    <CloudProviderIntegrationModal
      account={integratingAccount}
      isOpen={true}
      onClose={() => setIntegratingAccount(null)}
      onUpdateAccount={updated => {
        setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));
        setIntegratingAccount(null);
      }}
      onSyncLibrary={onSyncCloudLibrary}
      onShowToast={showToast}
      onDisconnect={accountId => {
        handleDisconnectAccount(accountId);
        setIntegratingAccount(null);
      }}
    />
  )}

  {/* Sidebar Action Modals */}
  <NewFolderModal
    isOpen={isNewFolderOpen}
    onClose={() => setIsNewFolderOpen(false)}
    onCreateFolder={handleCreateFolder}
  />

  <NewSharedLibraryModal
    isOpen={isNewLibraryOpen}
    onClose={() => setIsNewLibraryOpen(false)}
    onCreateLibrary={handleCreateLibrary}
  />

  <JoinIncomingLibraryModal
    isOpen={isJoinIncomingOpen}
    onClose={() => setIsJoinIncomingOpen(false)}
    onJoinLibrary={handleJoinIncomingLibrary}
  />

  <AddFavoriteModal
    isOpen={isAddFavoriteOpen}
    onClose={() => setIsAddFavoriteOpen(false)}
    networkServers={networkServers}
    removableDevices={removableDevices}
    favoritedSourceIds={favoritedSourceIds}
    onBrowseFolder={onBrowseFavoriteFolder}
    onAddNetwork={onAddFavoriteNetwork}
    onAddDevice={onAddFavoriteDevice}
  />

  <ConnectServerModal
    isOpen={isConnectServerOpen}
    onClose={() => setIsConnectServerOpen(false)}
    onAddServer={handleAddNetworkServer}
  />
  </>
);
