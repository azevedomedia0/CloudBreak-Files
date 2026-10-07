import React from 'react';
import { Image as ImageIcon, Folder, Video, FileText, Lock, Edit3, Scissors, Download, ChevronRight, Eye, HardDrive, Monitor, AppWindow } from 'lucide-react';
import { FileItem, CloudAccount, FolderItem, CloudProviderId } from '../../types';
import { formatBytes, formatDate } from '../../utils/format';

export interface ColumnsViewProps {
  files: FileItem[];
  selectedFolder: FolderItem | null;
  selectedFileId: string | null;
  selectedFile: FileItem | null;
  folders: FolderItem[];
  totalSize: number;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onSelectFolder: (folderId: string | null) => void;
  getAccount: (accountId: CloudProviderId) => CloudAccount | undefined;
}

export const ColumnsView: React.FC<ColumnsViewProps> = ({ files, selectedFolder, selectedFileId, selectedFile, folders, totalSize, onSelectFile, onEditPhoto, onOpenVideo, onOpenQuickLook, onSelectFolder, getAccount }) => (
    <div className="h-full flex gap-3 overflow-x-auto min-h-[480px]">
      {/* Col 1: Local Files & Folders */}
      <div className="w-64 macos-glass-card rounded-xl flex flex-col shrink-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-white/8 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          Local Files
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => onSelectFolder(null)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
              !selectedFolder ? 'bg-sky-500/20 text-sky-200 font-medium' : 'text-neutral-300 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <span>Root Bucket</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
          </button>

          {folders.map(f => {
            const isSel = selectedFolder?.id === f.id;
            const iconClass = `w-4 h-4 ${isSel ? 'text-sky-400' : 'text-neutral-400'}`;
            const renderIcon = () => {
              switch (f.name.toLowerCase()) {
                case 'desktop': return <Monitor className={iconClass} />;
                case 'documents': return <FileText className={iconClass} />;
                case 'photos': return <ImageIcon className={iconClass} />;
                case 'videos': return <Video className={iconClass} />;
                case 'downloads': return <Download className={iconClass} />;
                case 'applications': return <AppWindow className={iconClass} />;
                default: return <Folder className={iconClass} />;
              }
            };
            return (
              <button
                key={f.id}
                onClick={() => onSelectFolder(f.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                  isSel ? 'bg-sky-500/20 text-sky-200 font-medium' : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {renderIcon()}
                  <span className="truncate">{f.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Col 2: Files in Folder */}
      <div className="w-72 macos-glass-card rounded-xl flex flex-col shrink-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-white/8 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex justify-between">
          <span>Items ({files.length})</span>
          <span className="font-mono text-neutral-400">{formatBytes(totalSize)}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {files.map(file => {
            const isCurrent = selectedFileId === file.id;
            return (
              <button
                key={file.id}
                onClick={() => onSelectFile(file)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all ${
                  isCurrent
                    ? 'bg-sky-500/25 text-white font-medium shadow-sm'
                    : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {file.category === 'photo' && <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />}
                  {file.category === 'video' && <Video className="w-4 h-4 text-amber-400 shrink-0" />}
                  {file.category === 'document' && <FileText className="w-4 h-4 text-neutral-400 shrink-0" />}
                  {file.category === 'archive' && <Lock className="w-4 h-4 text-cyan-400 shrink-0" />}
                  <span className="truncate">{file.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Col 3: Miller Columns Live Preview & Inspector Pane */}
      {selectedFile && (
        <div className="w-80 md:w-96 macos-glass-card rounded-xl flex flex-col shrink-0 overflow-y-auto p-4 space-y-4">
          <div className="aspect-video rounded-lg overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center relative shadow-lg">
            {selectedFile.thumbnailUrl ? (
              <img src={selectedFile.thumbnailUrl} alt={selectedFile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-neutral-500 flex flex-col items-center gap-2">
                <FileText className="w-10 h-10 text-sky-400" />
                <span className="font-mono text-xs">{selectedFile.name}</span>
              </div>
            )}
            {selectedFile.encryption.isEncrypted && (
              <div className="absolute top-2 right-2 text-[10px] text-cyan-300 bg-black/80 px-2 py-0.5 rounded font-mono border border-cyan-500/40">
                AES-256 E2EE
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-neutral-100 break-words">{selectedFile.name}</h3>
            <p className="text-xs text-neutral-400 mt-1 font-mono">
              {formatBytes(selectedFile.sizeBytes)} · {formatDate(selectedFile.updatedAt)}
            </p>
          </div>

          {/* Direct Column Actions */}
          <div className="space-y-2 pt-1">
            {selectedFile.category === 'photo' && (
              <button
                onClick={() => onEditPhoto(selectedFile)}
                className="w-full py-2 px-3 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit in Studio Adjustments</span>
              </button>
            )}
            {selectedFile.category === 'video' && (
              <button
                onClick={() => onOpenVideo(selectedFile)}
                className="w-full py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Cinema Player & Trimmer</span>
              </button>
            )}
            <button
              onClick={onOpenQuickLook}
              className="w-full py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-neutral-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Quick Look Preview (Space)</span>
            </button>
          </div>

          {/* Metadata Summary */}
          <div className="p-3 bg-black/30 rounded-lg border border-white/5 space-y-2 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Cloud Bucket</span>
              <span className="text-neutral-200">{getAccount(selectedFile.accountId)?.name}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>MIME Type</span>
              <span className="font-mono text-neutral-300">{selectedFile.mimeType}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>SHA-256</span>
              <span className="font-mono text-[10px] text-neutral-300 truncate max-w-[150px]">
                {selectedFile.encryption.checksumSha256}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
);
