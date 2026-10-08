import React from 'react';
import { Image as ImageIcon, Video, FileText, Lock, Share2, Edit3, Scissors, CheckSquare, Square } from 'lucide-react';
import { FileItem, CloudAccount, CloudProviderId } from '../../types';
import { isEditableDocument } from '../../utils/documentKind';
import { FileThumbnail } from './FileThumbnail';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatBytes, formatDate } from '../../utils/format';

export interface ListViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  selectedFileId: string | null;
  selectedIds: Set<string>;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onShareFile: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
  toggleSelectAll: () => void;
  getAccount: (accountId: CloudProviderId) => CloudAccount | undefined;
}

export const ListView: React.FC<ListViewProps> = ({ accent, files, selectedFileId, selectedIds, onSelectFile, onEditPhoto, onOpenDocument, onOpenVideo, onShareFile, onOpenQuickLook, onFileContextMenu, toggleSelectOne, toggleSelectAll, getAccount }) => (
    <div className="rounded-xl overflow-hidden border border-white/8 bg-black/20">
      <table className="w-full text-left text-xs text-neutral-300">
        <thead className="bg-white/5 border-b border-white/8 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          <tr>
            <th className="p-3 w-8">
              <button onClick={toggleSelectAll}>
                {selectedIds.size === files.length && files.length > 0 ? (
                  <CheckSquare className={`w-3.5 h-3.5 ${SELECTION_CLASSES[accent].checkIcon}`} />
                ) : (
                  <Square className="w-3.5 h-3.5 text-neutral-500" />
                )}
              </button>
            </th>
            <th className="p-3">Name</th>
            <th className="p-3">Date Modified</th>
            <th className="p-3">Size</th>
            <th className="p-3">Kind</th>
            <th className="p-3">Cloud Storage</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 font-normal">
          {files.map(file => {
            const isSelected = selectedIds.has(file.id);
            const isCurrent = selectedFileId === file.id;
            const acc = getAccount(file.accountId);

            return (
              <tr
                key={file.id}
                onClick={() => onSelectFile(file)}
                onContextMenu={event => onFileContextMenu(file, event)}
                onDoubleClick={() => {
                  if (file.category === 'photo') onEditPhoto(file);
                  else if (file.category === 'video') onOpenVideo(file);
                  else if (isEditableDocument(file)) onOpenDocument(file);
                  else onOpenQuickLook();
                }}
                className={`cursor-pointer transition-colors ${
                  isCurrent
                    ? SELECTION_CLASSES[accent].row
                    : isSelected
                    ? SELECTION_CLASSES[accent].rowMulti
                    : 'hover:bg-white/5'
                }`}
              >
                <td className="p-3">
                  <button onClick={e => toggleSelectOne(file.id, e)}>
                    {isSelected ? (
                      <CheckSquare className={`w-3.5 h-3.5 ${SELECTION_CLASSES[accent].checkIcon}`} />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-neutral-600" />
                    )}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    <FileThumbnail file={file} compact className="w-10 h-7 rounded border border-white/10 bg-black/40 shrink-0" iconClassName="w-3.5 h-3.5" />
                    <span className="truncate max-w-xs">{file.name}</span>
                  </div>
                </td>
                <td className="p-3 text-neutral-400">{formatDate(file.updatedAt)}</td>
                <td className="p-3 font-mono text-neutral-400">{formatBytes(file.sizeBytes)}</td>
                <td className="p-3 text-neutral-400 font-mono text-[11px]">{file.mimeType.split('/')[1]?.toUpperCase() || file.category}</td>
                <td className="p-3">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-tr ${acc?.avatarColor || 'from-sky-400 to-cyan-500'}`} />
                    <span>{acc?.name}</span>
                  </span>
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {file.category === 'photo' && (
                      <button
                        onClick={() => onEditPhoto(file)}
                        className="p-1 rounded hover:bg-white/10 text-cyan-400"
                        title="Edit in Studio"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isEditableDocument(file) && (
                      <button
                        onClick={() => onOpenDocument(file)}
                        className="p-1 rounded hover:bg-white/10 text-[#7cacf8]"
                        title="Edit document"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {file.category === 'video' && (
                      <button
                        onClick={() => onOpenVideo(file)}
                        className="p-1 rounded hover:bg-white/10 text-amber-400"
                        title="Cinema Suite"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onShareFile(file)}
                      className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
);
