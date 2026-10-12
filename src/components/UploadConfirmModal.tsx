import React, { useEffect } from 'react';
import { FileText, Lock, X } from '@/src/icons';
import { formatBytes } from '../utils/format';

interface UploadConfirmModalProps {
  /** Files dropped from outside the app, waiting for the person to confirm. */
  files: File[];
  vaultUnlocked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const LISTED = 6;

/**
 * Shown before files dropped from Finder are added. Says what happens to them: they are a
 * local preview for this session, not sent to any cloud account.
 */
export const UploadConfirmModal: React.FC<UploadConfirmModalProps> = ({ files, vaultUnlocked, onConfirm, onCancel }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const count = files.length;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const shown = files.slice(0, LISTED);
  const hidden = count - shown.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-confirm-title"
        className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 id="upload-confirm-title" className="text-sm font-semibold text-white">
                Add {count} {count === 1 ? 'file' : 'files'} from outside Cloudbreak?
              </h3>
              <p className="text-[10px] text-neutral-400">{formatBytes(totalBytes)} in total</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-neutral-200">
            {shown.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3">
                <span className="truncate">{file.name}</span>
                <span className="font-mono text-[10px] text-neutral-500 shrink-0">{formatBytes(file.size)}</span>
              </li>
            ))}
            {hidden > 0 && <li className="text-[11px] text-neutral-500">and {hidden} more</li>}
          </ul>

          <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-neutral-300">
            {vaultUnlocked ? (
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-300" />
            ) : (
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500" />
            )}
            <p>
              They are added as a local preview for this session only. Nothing is sent to a cloud account,
              and they are gone when Cloudbreak quits.{' '}
              {vaultUnlocked
                ? 'They will be encrypted with your vault key.'
                : 'Unlock the vault first to encrypt them.'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/10 bg-black/20">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500/30 hover:bg-sky-500/40 border border-sky-400/40 text-sky-100 transition-colors"
          >
            Add {count === 1 ? 'file' : 'files'}
          </button>
        </div>
      </div>
    </div>
  );
};
