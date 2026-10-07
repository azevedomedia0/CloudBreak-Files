import React from 'react';
import { CloudAccount, CloudProviderId, FileItem, FolderItem, SharedLibrary } from '../types';
import { QuickLookModal } from './QuickLookModal';
import { PhotoNav } from './PhotoNavArrows';
import { PhotoEditorModal } from './PhotoEditorModal';
import { VideoPlayerModal } from './VideoPlayerModal';
import { ShareLibraryModal } from './ShareLibraryModal';
import { VaultSecurityModal } from './VaultSecurityModal';
import { ProfileSettingsModal, UserProfile } from './ProfileSettingsModal';
import { AddAccountModal } from './AddAccountModal';
import { CloudProviderIntegrationModal } from './CloudProviderIntegrationModal';
import { NewFolderModal, NewSharedLibraryModal, AddFavoriteModal, ConnectServerModal, JoinIncomingLibraryModal } from './SidebarModals';

export interface AppModalsProps {
  selectedFile: FileItem | null;
  photoNav: PhotoNav | null;
  accounts: CloudAccount[];
  folders: FolderItem[];
  isQuickLookOpen: boolean;
  setIsQuickLookOpen: (open: boolean) => void;
  setEditingPhotoFile: (file: FileItem | null) => void;
  setPlayingVideoFile: (file: FileItem | null) => void;
  sharedLibraries: SharedLibrary[];
  setSharingLibrary: (library: SharedLibrary | null) => void;
  editingPhotoFile: FileItem | null;
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
  isVaultSecurityOpen: boolean;
  setIsVaultSecurityOpen: (open: boolean) => void;
  isVaultUnlocked: boolean;
  handleToggleVaultLock: (unlocked: boolean, passphrase?: string) => Promise<void>;
  isProfileSettingsOpen: boolean;
  setIsProfileSettingsOpen: (open: boolean) => void;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  showToast: (msg: string) => void;
  isAddAccountOpen: boolean;
  setIsAddAccountOpen: (open: boolean) => void;
  setAccounts: React.Dispatch<React.SetStateAction<CloudAccount[]>>;
  setSelectedAccountId: (id: CloudProviderId) => void;
  integratingAccount: CloudAccount | null;
  setIntegratingAccount: (account: CloudAccount | null) => void;
  isNewFolderOpen: boolean;
  setIsNewFolderOpen: (open: boolean) => void;
  handleCreateFolder: (name: string, category: string) => void;
  isNewLibraryOpen: boolean;
  setIsNewLibraryOpen: (open: boolean) => void;
  handleCreateLibrary: (name: string, description: string, memberEmail: string, role: 'viewer' | 'editor' | 'admin') => void;
  isJoinIncomingOpen: boolean;
  setIsJoinIncomingOpen: (open: boolean) => void;
  handleJoinIncomingLibrary: (name: string, inviteUrlOrCode: string, ownerName: string) => void;
  isAddFavoriteOpen: boolean;
  setIsAddFavoriteOpen: (open: boolean) => void;
  handleAddFavorite: (name: string) => void;
  isConnectServerOpen: boolean;
  setIsConnectServerOpen: (open: boolean) => void;
  handleAddNetworkServer: (name: string, address: string, protocol: string) => void;
  handleDisconnectAccount: (accountId: string) => void;
}

/** Every modal the app can open. Each one renders nothing while it is closed. */
export const AppModals: React.FC<AppModalsProps> = ({
  selectedFile,
  photoNav,
  accounts,
  folders,
  isQuickLookOpen,
  setIsQuickLookOpen,
  setEditingPhotoFile,
  setPlayingVideoFile,
  sharedLibraries,
  setSharingLibrary,
  editingPhotoFile,
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
  isVaultSecurityOpen,
  setIsVaultSecurityOpen,
  isVaultUnlocked,
  handleToggleVaultLock,
  isProfileSettingsOpen,
  setIsProfileSettingsOpen,
  userProfile,
  setUserProfile,
  showToast,
  isAddAccountOpen,
  setIsAddAccountOpen,
  setAccounts,
  setSelectedAccountId,
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
  handleAddFavorite,
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
    />
  )}

  {/* Modal 2: Cinema Video Player, Trimmer & Converter */}
  {playingVideoFile && (
    <VideoPlayerModal
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
      showToast(`Profile updated: ${updated.name}`);
    }}
    accounts={accounts}
    isVaultUnlocked={isVaultUnlocked}
    onToggleVaultLock={handleToggleVaultLock}
    onShowToast={showToast}
  />

  {/* Modal 5: Connect / Mount New Cloud Account */}
  <AddAccountModal
    isOpen={isAddAccountOpen}
    onClose={() => setIsAddAccountOpen(false)}
    onAddAccount={newAcc => {
      setAccounts(prev => [...prev, newAcc]);
      setSelectedAccountId(newAcc.id);
      showToast(`Mounted ${newAcc.name}`);
    }}
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
    onAddFavorite={handleAddFavorite}
  />

  <ConnectServerModal
    isOpen={isConnectServerOpen}
    onClose={() => setIsConnectServerOpen(false)}
    onAddServer={handleAddNetworkServer}
  />
  </>
);
