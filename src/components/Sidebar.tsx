import React, { useState, useMemo } from 'react';
import { Folder, Radio, Server, Globe, Cpu, Monitor, Download, AppWindow, Image as ImageIcon, Video, FileText, Settings, Trash2 } from 'lucide-react';
import { CloudAccount, FolderItem, SharedLibrary, CloudProviderId, RemovableDevice } from '../types';
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
  onAddNewSharedLibrary?: () => void;
  onAddNewIncomingLibrary?: () => void;
  onAddNewOutgoingLibrary?: () => void;
  onAddNetworkServer?: () => void;
  networkServers?: Array<{ name: string; desc: string; icon?: any; online: boolean }>;
  removableDevices?: RemovableDevice[];
  onEjectDevice?: (deviceId: string) => void;
  onSelectRemovableDevice?: (device: RemovableDevice) => void;
  selectedRemovableDeviceId?: string | null;
  onSelectNetworkServer?: (name: string) => void;
  selectedNetworkServerName?: string | null;
  customFavorites?: Array<{ id: string; name: string }>;
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
    name: 'Steven Azevedo',
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
  onAddNewSharedLibrary,
  onAddNewIncomingLibrary,
  onAddNewOutgoingLibrary,
  onAddNetworkServer,
  networkServers = [
    { name: 'Studio NAS (10GbE SMB)', desc: '192.168.1.100', icon: Server, online: true },
    { name: 'Render Farm Cluster', desc: 'Node 01-08', icon: Cpu, online: true },
    { name: 'Aether P2P Relay', desc: 'Direct encrypted', icon: Radio, online: true },
    { name: 'Edge Gateway (Cloud Relay)', desc: 'Direct encrypted proxy', icon: Globe, online: true },
  ],
  removableDevices = [],
  onEjectDevice,
  onSelectRemovableDevice,
  selectedRemovableDeviceId,
  onSelectNetworkServer,
  selectedNetworkServerName,
  customFavorites = [],
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
  const p2pSharedCount = sharedLibraries.length;

  const visibleFolders = folders.filter(f => f.accountId === 'all');

  const getFolderIcon = (name: string, isSelected: boolean) => {
    const iconClass = `w-4 h-4 shrink-0 ${isSelected ? 'text-sky-400' : 'text-sky-400/80'}`;
    switch (name.toLowerCase()) {
      case 'desktop':
        return <Monitor className={iconClass} />;
      case 'documents':
        return <FileText className={iconClass} />;
      case 'photos':
        return <ImageIcon className={iconClass} />;
      case 'videos':
        return <Video className={iconClass} />;
      case 'downloads':
        return <Download className={iconClass} />;
      case 'applications':
        return <AppWindow className={iconClass} />;
      case 'trash':
        return <Trash2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-rose-400' : 'text-neutral-400 group-hover:text-rose-300'}`} />;
      default:
        return <Folder className={iconClass} />;
    }
  };

  // Map section keys to their component rendering
  const sectionComponents = useMemo(() => ({
    favorites: (
      <FavoritesSection
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        selectedLibraryId={selectedLibraryId}
        onSelectLibrary={onSelectLibrary}
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
        selectedNetworkServerName={selectedNetworkServerName}
        collapsed={collapsed}
        toggleSection={toggleSection}
        onlineServerCount={onlineServerCount}
        totalServerCount={totalServerCount}
      />
    ),
  }), [accounts, selectedAccountId, onSelectAccount, selectedFolderId, onSelectFolder, selectedLibraryId, onSelectLibrary, onAddFavorite, customFavorites, collapsed, visibleFolders, incomingLibraries, outgoingLibraries, onAddNewSharedLibrary, onAddNewIncomingLibrary, onAddNewOutgoingLibrary, onOpenAddAccount, onOpenAccountSettings, onAddNetworkServer, networkServers, removableDevices, onEjectDevice, onSelectRemovableDevice, selectedRemovableDeviceId, onSelectNetworkServer, selectedNetworkServerName, onlineServerCount, totalServerCount]);

  if (isCollapsed) {
    return null;
  }

  return (
    <aside 
      style={{ width: `${width}px` }}
      className="macos-sidebar-glass flex flex-col h-full select-none shrink-0 text-xs overflow-hidden transition-[width] duration-200 ease-out"
    >
      
      {/* Scrollable macOS Finder Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">

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

      {/* Bottom Profile & App Settings Tile */}
      <ProfileFooter onOpenVaultSecurity={onOpenVaultSecurity} onOpenProfileSettings={onOpenProfileSettings} userProfile={userProfile} incomingLibraries={incomingLibraries} outgoingLibraries={outgoingLibraries} onlineServerCount={onlineServerCount} totalServerCount={totalServerCount} />

    </aside>
  );
};
