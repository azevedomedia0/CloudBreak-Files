import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { FileItem } from '../../types';
import { fileExtension } from '../../utils/documentKind';
import { formatBytes, formatDate } from '../../utils/format';
import { FileThumbnail } from './FileThumbnail';
import { emitFileContextMenu } from '../../utils/fileContextMenuBus';

function fileKind(file: FileItem): string {
  const ext = fileExtension(file.name).toUpperCase();
  if (file.category === 'photo') return ext ? `${ext} image` : 'Image';
  if (file.category === 'video') return ext ? `${ext} movie` : 'Movie';
  if (file.category === 'audio') return ext ? `${ext} audio` : 'Audio';
  if (file.category === 'archive') return ext ? `${ext} archive` : 'Archive';
  if (file.category === 'document') return ext ? `${ext} document` : 'Document';
  return file.mimeType || 'File';
}

export const FileGetInfo: React.FC<{
  file: FileItem;
  onClose: () => void;
}> = ({ file, onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows: [string, string][] = [
    ['Kind', fileKind(file)],
    ['Size', formatBytes(file.sizeBytes)],
    ['Where', file.folderPath || '/'],
    ['Modified', formatDate(file.updatedAt)],
    ['Version', String(file.version)],
  ];

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={`Info for ${file.name}`}
        className="w-[340px] rounded-xl border border-white/15 bg-neutral-900/95 text-neutral-100 shadow-2xl backdrop-blur-xl overflow-hidden"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-neutral-950/80">
          <span className="text-[12px] font-medium text-neutral-300">Get Info</span>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <FileThumbnail
              file={file}
              compact
              className="w-14 h-12 rounded-lg border border-white/10 bg-black/40 shrink-0"
              iconClassName="w-6 h-6"
              onContextMenu={event => emitFileContextMenu(file, event.clientX, event.clientY)}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold break-words">{file.name}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{fileKind(file)}</p>
            </div>
          </div>
          <dl className="space-y-1.5 text-[12px]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-neutral-400 shrink-0">{label}</dt>
                <dd className="text-neutral-100 text-right truncate">{value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-400 shrink-0">Tags</dt>
              <dd className="text-neutral-100 text-right">{file.tags.length ? file.tags.join(', ') : 'None'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};
