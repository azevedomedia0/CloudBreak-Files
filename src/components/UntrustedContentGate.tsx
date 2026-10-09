import React, { useEffect } from 'react';
import { ShieldAlert, ShieldOff, FileWarning, X } from 'lucide-react';
import type { ContentSafetyReport } from '../utils/contentSafety';

export interface UntrustedContentGateProps {
  fileName: string;
  report: ContentSafetyReport;
  isOpen: boolean;
  onConfirm: () => void;
  /** Deny / remove panel — extracted content must not enter the editor. */
  onDeny: () => void;
}

/**
 * Modal gate: Confirm opens the file as untrusted data only;
 * Deny closes the panel so payloads cannot rewrite execution logic.
 */
export const UntrustedContentGate: React.FC<UntrustedContentGateProps> = ({
  fileName,
  report,
  isOpen,
  onConfirm,
  onDeny,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDeny();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onDeny]);

  if (!isOpen) return null;

  const severity = report.risk === 'high' ? 'high' : 'medium';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fadeIn"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="untrusted-gate-title"
      aria-describedby="untrusted-gate-desc"
    >
      <div
        className="app-modal-panel w-full max-w-md rounded-2xl overflow-hidden macos-window shadow-2xl border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 macos-toolbar-glass border-b border-white/8">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className={`w-4 h-4 shrink-0 ${severity === 'high' ? 'text-amber-400' : 'text-orange-300'}`} />
            <span id="untrusted-gate-title" className="text-xs font-semibold text-neutral-100 truncate">
              Untrusted external content
            </span>
          </div>
          <button
            type="button"
            onClick={onDeny}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Deny and close"
            aria-label="Deny and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3" id="untrusted-gate-desc">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl border shrink-0 ${
              severity === 'high'
                ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                : 'bg-orange-500/15 border-orange-400/30 text-orange-300'
            }`}>
              <FileWarning className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-100 break-words">
                “{fileName}” looks like it may be trying something malicious
              </p>
              <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                Data extracted from this file is treated as untrusted external content.
                It cannot rewrite Cloudbreak execution logic or system prompts.
              </p>
            </div>
          </div>

          {report.reasons.length > 0 && (
            <ul className="rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 space-y-1.5">
              {report.reasons.slice(0, 6).map(reason => (
                <li key={reason} className="text-[11px] text-neutral-300 flex gap-2 leading-snug">
                  <span className="text-amber-400/90 shrink-0">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}

          {report.htmlHardened && (
            <p className="text-[10px] text-sky-300/90 font-mono">
              Active HTML (scripts / embeds) was already stripped.
            </p>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-white/8 bg-black/25 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onDeny}
            className="h-9 px-3.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Deny & close panel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-amber-500/20"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Confirm — open as data only
          </button>
        </div>
      </div>
    </div>
  );
};
