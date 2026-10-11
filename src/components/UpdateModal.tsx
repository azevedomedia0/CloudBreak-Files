import React, { useState } from 'react';
import { X, RefreshCw } from '@/src/icons';
import {
  describeUpdateError,
  downloadAndInstallUpdate,
  type UpdateCheckResult,
  type UpdateProgress,
} from '../services/updaterBridge';
import { formatBytes } from '../utils/format';

export type UpdateOffer = Extract<UpdateCheckResult, { available: true }>;

interface UpdateModalProps {
  offer: UpdateOffer;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ offer, onClose }) => {
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  const install = async () => {
    setError(null);
    setProgress({ downloaded: 0, total: null, phase: 'downloading' });
    try {
      await downloadAndInstallUpdate(offer.update, setProgress);
      // The app restarts here; nothing more to do.
    } catch (err) {
      setProgress(null);
      setError(describeUpdateError(err, 'install'));
    }
  };

  const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        className="app-modal-panel w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Update available</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Version {offer.version} · you have {offer.currentVersion}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {offer.notes ? (
            <p className="text-sm text-neutral-300 whitespace-pre-wrap max-h-40 overflow-y-auto">{offer.notes}</p>
          ) : (
            <p className="text-sm text-neutral-400">This release has no notes.</p>
          )}

          {busy ? (
            <div className="space-y-2" aria-live="polite">
              <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-cyan-400 transition-all duration-200 ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-neutral-400 tabular-nums">
                {progress?.phase === 'installing'
                  ? 'Installing… the app will restart.'
                  : percent !== null && progress?.total
                    ? `Downloading ${formatBytes(progress.downloaded)} of ${formatBytes(progress.total)} (${percent}%)`
                    : 'Downloading…'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Cloudbreak will restart to finish updating. Save any open documents first.
            </p>
          )}

          {error && (
            <div role="alert" className="px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium disabled:opacity-40"
            >
              Later
            </button>
            <button
              onClick={() => void install()}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 text-xs font-semibold disabled:opacity-60 flex items-center gap-1.5"
            >
              {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {error ? 'Try again' : busy ? 'Updating…' : 'Install and restart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
