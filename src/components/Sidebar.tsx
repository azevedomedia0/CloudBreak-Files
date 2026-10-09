import React, { useState, useMemo } from 'react';
import { Settings } from 'lucide-react';
import type { NetworkServerEntry } from '../services/volumesBridge';
import type { SwarmStatus } from '../services/p2pBridge';
import { CloudAccount, FolderItem, SharedLibrary, CloudProviderId, RemovableDevice, FavoriteShortcut } from '../types';
import { FavoritesSection } from './sidebar/FavoritesSection';
import { FoldersSection } from './sidebar/FoldersSection';
import { IncomingLibrariesSection } from './sidebar/IncomingLibrariesSection';
import { OutgoingLibrariesSection } from './sidebar/OutgoingLibrariesSection';
import { CloudAccountsSection } from './sidebar/CloudAccountsSection';
import { NetworkSection } from './sidebar/NetworkSection';
import { ProfileFooter } from './sidebar/ProfileFooter';
import { SidebarSectionKey } from './sidebar/sectionKey';
import { useSectionOrder } from '../hooks/useSectionOrder';
import { DraggableSidebarSection } from './DraggableSidebarSection';
import { isIncomingLibrary, isOutgoingLibrary } from '../utils/libraryDirection';
import { getFolderIcon } from '../utils/folderIcons';
import { sortLocalRootFolders } from '../utils/defaultLocalFolders';

interface SidebarProps {
  accounts: CloudAccount[];
  selectedAccountId: CloudProviderId;
  onSelectAccount: (accountId: CloudProviderId) => void;
  folders: FolderItem[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  sharedLibraries: SharedLibrary[];
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string | null) => void;
  onOpenAddAccount: () => void;
  onOpenVaultSecurity: () => void;
  onOpenProfileSettings?: () => void;
  onOpenAccountSettings?: (account: CloudAccount) => void;
  userProfile?: { name: string; email: string; avatarUrl?: string; role?: string };
  onOpenShareModal: (library: SharedLibrary) => void;
  isVaultUnlocked: boolean;
  width?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onAddFavorite?: () => void;
  onAddNewFolder?: () => void;
  onRescanLocalFolders?: () => void;
  isRescanningLocal?: boolean;
  onAddNewSharedLibrary?: () => void;
  onAddNewIncomingLibrary?: () => void;
  onAddNewOutgoingLibrary?: () => void;
  onAddNetworkServer?: () => void;
  networkServers?: NetworkServerEntry[];
  removableDevices?: RemovableDevice[];
  onEjectDevice?: (deviceId: string) => void;
  onSelectRemovableDevice?: (device: RemovableDevice) => void;
  selectedRemovableDeviceId?: string | null;
  onSelectNetworkServer?: (server: NetworkServerEntry) => void;
  selectedNetworkServerId?: string | null;
  swarmStatus?: SwarmStatus | null;
  customFavorites?: FavoriteShortcut[];
  selectedSourceId?: string | null;
  onSelectFavoriteSource?: (sourceId: string) => void;
  compact?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  folders,
  selectedFolderId,
  onSelectFolder,
  sharedLibraries,
  selectedLibraryId,
  onSelectLibrary,
  onOpenAddAccount,
  onOpenVaultSecurity,
  onOpenProfileSettings,
  onOpenAccountSettings,
  userProfile = {
    name: 'User',
    email: 'you@example.com',
    role: 'Sovereign Vault Administrator',
  },
  onOpenShareModal,
  isVaultUnlocked,
  width = 240,
  isCollapsed = false,
  onToggleCollapse,
  onAddFavorite,
  onAddNewFolder,
  onRescanLocalFolders,
  isRescanningLocal = false,
  onAddNewSharedLibrary,
  onAddNewIncomingLibrary,
  onAddNewOutgoingLibrary,
  onAddNetworkServer,
  networkServers = [],
  removableDevices = [],
  onEjectDevice,
  onSelectRemovableDevice,
  selectedRemovableDeviceId,
  onSelectNetworkServer,
  selectedNetworkServerId,
  swarmStatus = null,
  customFavorites = [],
  selectedSourceId = null,
  onSelectFavoriteSource,
  compact = false,
}) => {
  const [collapsed, setCollapsed] = useState<{
    favorites?: boolean;
    directories?: boolean;
    incomingLibraries?: boolean;
    outgoingLibraries?: boolean;
    accounts?: boolean;
    network?: boolean;
  }>({});

  const { sectionOrder, draggingKey, dropTarget, startDrag, updateDropTarget, endDrag } = useSectionOrder();

  const toggleSection = (section: SidebarSectionKey) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const incomingLibraries = sharedLibraries.filter(isIncomingLibrary);
  const outgoingLibraries = sharedLibraries.filter(isOutgoingLibrary);

  const onlineServerCount = networkServers.filter(s => s.online).length;
  const totalServerCount = networkServers.length;
  const visibleFolders = sortLocalRootFolders(
    folders.filter(f => f.accountId === 'all' && !f.parentId),
  );

  // Map section keys to their component rendering
  const sectionComponents = useMemo(() => ({
    favorites: (
      <FavoritesSection
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        selectedLibraryId={selectedLibraryId}
        onSelectLibrary={onSelectLibrary}
        selectedSourceId={selectedSourceId}
        onSelectSource={onSelectFavoriteSource ?? (() => {})}
        onAddFavorite={onAddFavorite}
        customFavorites={customFavorites}
        collapsed={collapsed}
        toggleSection={toggleSection}
      />
    ),
    directories: (
      <FoldersSection
        onSelectAccount={onSelectAccount}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        onSelectLibrary={onSelectLibrary}
        onAddNewFolder={onAddNewFolder}
        onRescanFolders={onRescanLocalFolders}
        isRescanning={isRescanningLocal}
        collapsed={collapsed}
        toggleSection={toggleSection}
        visibleFolders={visibleFolders}
        getFolderIcon={getFolderIcon}
      />
    ),
    incomingLibraries: (
      <IncomingLibrariesSection
        onSelectFolder={onSelectFolder}
        selectedLibraryId={selectedLibraryId}
        onSelectLibrary={onSelectLibrary}
        onAddNewSharedLibrary={onAddNewSharedLibrary}
        onAddNewIncomingLibrary={onAddNewIncomingLibrary}
        collapsed={collapsed}
        toggleSection={toggleSection}
        incomingLibraries={incomingLibraries}
      />
    ),
    outgoingLibraries: (
      <OutgoingLibrariesSection
        onSelectFolder={onSelectFolder}
        selectedLibraryId={selectedLibraryId}
        onSelectLibrary={onSelectLibrary}
        onAddNewSharedLibrary={onAddNewSharedLibrary}
        onAddNewOutgoingLibrary={onAddNewOutgoingLibrary}
        collapsed={collapsed}
        toggleSection={toggleSection}
        outgoingLibraries={outgoingLibraries}
      />
    ),
    accounts: (
      <CloudAccountsSection
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        selectedLibraryId={selectedLibraryId}
        onSelectLibrary={onSelectLibrary}
        onOpenAddAccount={onOpenAddAccount}
        onOpenAccountSettings={onOpenAccountSettings}
        collapsed={collapsed}
        toggleSection={toggleSection}
      />
    ),
    network: (
      <NetworkSection
        onAddNetworkServer={onAddNetworkServer}
        networkServers={networkServers}
        removableDevices={removableDevices}
        onEjectDevice={onEjectDevice}
        onSelectRemovableDevice={onSelectRemovableDevice}
        selectedRemovableDeviceId={selectedRemovableDeviceId}
        onSelectNetworkServer={onSelectNetworkServer}
        selectedNetworkServerId={selectedNetworkServerId}
        collapsed={collapsed}
        toggleSection={toggleSection}
        onlineServerCount={onlineServerCount}
        totalServerCount={totalServerCount}
      />
    ),
  }), [accounts, selectedAccountId, onSelectAccount, selectedFolderId, onSelectFolder, selectedLibraryId, onSelectLibrary, onAddFavorite, customFavorites, collapsed, visibleFolders, incomingLibraries, outgoingLibraries, onAddNewFolder, onRescanLocalFolders, isRescanningLocal, onAddNewSharedLibrary, onAddNewIncomingLibrary, onAddNewOutgoingLibrary, onOpenAddAccount, onOpenAccountSettings, onAddNetworkServer, networkServers, removableDevices, onEjectDevice, onSelectRemovableDevice, selectedRemovableDeviceId, onSelectNetworkServer, selectedNetworkServerId, onlineServerCount, totalServerCount, selectedSourceId, onSelectFavoriteSource]);

  if (isCollapsed) {
    return null;
  }

  return (
    <aside 
      style={{ width: `${width}px` }}
      className="macos-sidebar-glass flex flex-col h-full min-h-0 select-none shrink-0 text-xs overflow-hidden transition-[width] duration-200 ease-out"
    >
      
      {/* Scrollable navigation — takes remaining height above the pinned footer */}
      <div className={`flex-1 min-h-0 overflow-y-auto px-3 py-2 ${compact ? 'space-y-2 text-[11px]' : 'space-y-4'}`}>

        {/* Render sections in custom order */}
        {sectionOrder.map((sectionKey) => (
          <DraggableSidebarSection
            key={sectionKey}
            sectionKey={sectionKey}
            isDragging={draggingKey === sectionKey}
            dropPosition={dropTarget?.key === sectionKey ? dropTarget.position : null}
            onDragStart={startDrag}
            onDropTargetChange={updateDropTarget}
            onDragEnd={endDrag}
          >
            {sectionComponents[sectionKey as keyof typeof sectionComponents]}
          </DraggableSidebarSection>
        ))}

      </div>

      {/* Always pinned to the bottom of the sidebar viewport */}
      <ProfileFooter onOpenVaultSecurity={onOpenVaultSecurity} onOpenProfileSettings={onOpenProfileSettings} userProfile={userProfile} incomingLibraries={incomingLibraries} outgoingLibraries={outgoingLibraries} onlineServerCount={onlineServerCount} totalServerCount={totalServerCount} swarmStatus={swarmStatus} />

    </aside>
  );
};
