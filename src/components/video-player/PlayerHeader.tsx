import React from 'react';
import { X, Scissors, RefreshCw, ShieldCheck, Film, Play } from 'lucide-react';
import { FileItem } from '../../types';
import { formatTimecode } from '../../utils/format';

export interface PlayerHeaderProps {
  file: FileItem;
  duration: number;
  activeTab: 'player' | 'trim' | 'convert';
  setActiveTab: (tab: 'player' | 'trim' | 'convert') => void;
  onClose: () => void;
}

export const PlayerHeader: React.FC<PlayerHeaderProps> = ({ file, duration, activeTab, setActiveTab, onClose }) => (
    <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950/80">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
          <Film className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-100 truncate max-w-md">
              {file.name}
            </h2>
            {file.encryption.isEncrypted && (
              <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" /> E2EE Stream
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            {file.videoMeta?.codec || 'H.264'} · {file.videoMeta?.dimensions?.width}×{file.videoMeta?.dimensions?.height} · {file.videoMeta?.framerate} fps · {formatTimecode(duration)}
          </p>
        </div>
      </div>

      {/* Mode Switcher Buttons */}
      <div className="flex items-center gap-2">
        <div className="flex p-0.5 bg-neutral-800 rounded-lg border border-neutral-700/60 text-xs">
          <button
            onClick={() => setActiveTab('player')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'player'
                ? 'bg-neutral-700 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Player</span>
          </button>
          <button
            onClick={() => setActiveTab('trim')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'trim'
                ? 'bg-neutral-700 text-cyan-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Trim Cut</span>
          </button>
          <button
            onClick={() => setActiveTab('convert')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'convert'
                ? 'bg-neutral-700 text-amber-300 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Convert</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg ml-2"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
);
