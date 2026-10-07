import React from 'react';
import { Plus, ChevronDown, Settings } from 'lucide-react';
import { CloudAccount, CloudProviderId } from '../../types';
import { ProviderIcon } from './ProviderIcon';
import { SidebarSectionKey } from './sectionKey';

export interface CloudAccountsSectionProps {
  accounts: CloudAccount[];
  selectedAccountId: CloudProviderId;
  onSelectAccount: (accountId: CloudProviderId) => void;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string | null) => void;
  onOpenAddAccount: () => void;
  onOpenAccountSettings?: (account: CloudAccount) => void;
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
}

export const CloudAccountsSection: React.FC<CloudAccountsSectionProps> = ({ accounts, selectedAccountId, onSelectAccount, selectedFolderId, onSelectFolder, selectedLibraryId, onSelectLibrary, onOpenAddAccount, onOpenAccountSettings, collapsed, toggleSection }) => (
    <div className="space-y-0.5">
      <div 
        onClick={() => toggleSection('accounts')}
        className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group"
      >
        <div className="flex items-center gap-1.5">
          <span>Cloud Accounts</span>
          <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsed.accounts ? '-rotate-90' : ''}`} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAddAccount();
          }}
          className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-cyan-300 transition-colors"
          title="Mount Cloud Account"
          aria-label="Mount Cloud Account"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
        </button>
      </div>

      {!collapsed.accounts && (
        <div className="space-y-0.5">
          {accounts.filter(acc => acc.status !== 'offline').map(acc => {
            const isSelected = selectedAccountId === acc.id && !selectedLibraryId && !selectedFolderId;
            const pct = Math.min(100, Math.round((acc.usedBytes / acc.totalBytes) * 100));

            return (
              <button
                key={acc.id}
                onClick={() => {
                  onSelectAccount(acc.id);
                  onSelectFolder(null);
                  onSelectLibrary(null);
                }}
                title={`${acc.name} (${acc.provider})\nAccount: ${acc.email}\nSecurity: ${acc.encryptionLevel}`}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all group ${
                  isSelected
                    ? 'bg-sky-500/20 text-sky-200 font-medium shadow-sm'
                    : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <ProviderIcon account={acc} />
                  <span className="truncate">{acc.name}</span>
                </div>
                
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAccountSettings?.(acc);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onOpenAccountSettings?.(acc);
                    }
                  }}
                  title={`Configure & Integrate ${acc.name} (${acc.provider})`}
                  aria-label={`Integrate ${acc.name}`}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-neutral-400 hover:text-sky-300 hover:bg-white/10 active:scale-95 transition-all opacity-70 group-hover:opacity-100 hover:border hover:border-white/10 shrink-0 cursor-pointer shadow-xs ml-1"
                >
                  <Settings className="w-3.5 h-3.5 stroke-[2] hover:rotate-45 transition-transform duration-200" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
);
