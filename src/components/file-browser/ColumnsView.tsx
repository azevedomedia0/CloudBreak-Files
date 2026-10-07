import React from 'react';
import { Image as ImageIcon, Folder, Video, FileText, Lock, Edit3, Scissors, Download, ChevronRight, Eye, HardDrive, Monitor, AppWindow } from 'lucide-react';
import { FileItem, CloudAccount, FolderItem, CloudProviderId } from '../../types';
import { isEditableDocument } from '../../utils/documentKind';
import { FileThumbnail } from './FileThumbnail';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatBytes, formatDate } from '../../utils/format';

export interface ColumnsViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  selectedFolder: FolderItem | null;
  selectedFileId: string | null;
  selectedFile: FileItem | null;
  folders: FolderItem[];
  totalSize: number;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  onSelectFolder: (folderId: string | null) => void;
  getAccount: (accountId: CloudProviderId) => CloudAccount | undefined;
}

export const ColumnsView: React.FC<ColumnsViewProps> = ({ accent, files, selectedFolder, selectedFileId, selectedFile, folders, totalSize, onSelectFile, onEditPhoto, onOpenDocument, onOpenVideo, onOpenQuickLook, onFileContextMenu, onSelectFolder, getAccount }) => (
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
                onContextMenu={event => onFileContextMenu(file, event)}
                onDoubleClick={() => {
                  if (file.category === 'photo') onEditPhoto(file);
                  else if (file.category === 'video') onOpenVideo(file);
                  else if (isEditableDocument(file)) onOpenDocument(file);
                  else onOpenQuickLook();
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all ${
                  isCurrent
                    ? SELECTION_CLASSES[accent].columnRow
                    : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <FileThumbnail file={file} compact className="w-8 h-6 rounded border border-white/10 bg-black/40 shrink-0" iconClassName="w-3 h-3" />
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
        <div
          className="w-80 md:w-96 macos-glass-card rounded-xl flex flex-col shrink-0 overflow-y-auto p-4 space-y-4"
          onContextMenu={event => onFileContextMenu(selectedFile, event)}
        >
          <div className="aspect-video rounded-lg overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center relative shadow-lg">
            <FileThumbnail file={selectedFile} className="w-full h-full" />
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
            {isEditableDocument(selectedFile) && (
              <button
                onClick={() => onOpenDocument(selectedFile)}
                className="w-full py-2 px-3 rounded-lg bg-[#0060df] hover:bg-[#0250bb] text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit document</span>
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
