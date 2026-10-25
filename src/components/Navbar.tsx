import React, { useRef } from 'react';
import {
  Search, Upload, ShieldCheck, Plus, Sparkles, Filter, 
  Image as ImageIcon, Video, FileText, Lock, Layers, CheckCircle2
} from '@/src/icons';
import { FileCategory, CloudAccount } from '../types';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: FileCategory;
  onCategoryChange: (cat: FileCategory) => void;
  onUploadFiles: (files: FileList) => void;
  isVaultUnlocked: boolean;
  onOpenVaultSecurity: () => void;
  activeAccountName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onUploadFiles,
  isVaultUnlocked,
  onOpenVaultSecurity,
  activeAccountName,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(e.target.files);
    }
  };

  const categories: { id: FileCategory; label: string; icon: any }[] = [
    { id: 'all', label: 'All Media', icon: Layers },
    { id: 'photo', label: 'Photos', icon: ImageIcon },
    { id: 'video', label: 'Videos', icon: Video },
    { id: 'document', label: 'Docs', icon: FileText },
    { id: 'archive', label: 'Encrypted', icon: Lock },
  ];

  return (
    <header className="h-16 border-b border-neutral-800 bg-neutral-950/90 px-6 flex items-center justify-between gap-4 select-none shrink-0">
      
      {/* Search Input with cross-cloud scope */}
      <div className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={`Search files across ${activeAccountName}...`}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-12 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 font-mono bg-neutral-800 px-1.5 py-0.5 rounded">
          ⌘K
        </div>
      </div>

      {/* Category Pills */}
      <div className="hidden lg:flex items-center gap-1 p-1 bg-neutral-900/80 rounded-xl border border-neutral-800 text-xs">
        {categories.map(cat => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                isSelected
                  ? 'bg-neutral-800 text-cyan-300 shadow-sm border border-neutral-700/60'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Actions and vault status */}
      <div className="flex items-center gap-3">
        
        {/* Vault status indicator */}
        <button
          onClick={onOpenVaultSecurity}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-cyan-500/40 transition-colors text-xs text-neutral-300 group"
          title="Open vault settings"
        >
          <span className={`w-2 h-2 rounded-full ${isVaultUnlocked ? 'bg-cyan-400' : 'bg-amber-400'}`} />
          <span className="font-mono text-[11px] text-neutral-400 group-hover:text-cyan-300 transition-colors">
            {isVaultUnlocked ? 'Vault Unlocked' : 'Vault Locked'}
          </span>
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
        </button>

        {/* Upload Button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-bold text-xs transition-colors shadow-lg shadow-cyan-500/20"
        >
          <Upload className="w-4 h-4" />
          <span>Upload File</span>
        </button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 border border-cyan-400/30 flex items-center justify-center font-bold text-xs text-white shadow-sm">
          SA
        </div>

      </div>

    </header>
  );
};
