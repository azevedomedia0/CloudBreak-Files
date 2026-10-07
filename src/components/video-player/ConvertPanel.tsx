import React from 'react';
import { RefreshCw, Check, Sparkles, HardDrive, Monitor, Scissors, FolderOpen } from 'lucide-react';
import { VideoConvertOptions, FileItem, CloudAccount, CloudProviderId, FolderItem, isAudioConvertFormat } from '../../types';
import { formatTimecode } from '../../utils/format';

export interface SaveDestination {
  kind: 'cloud' | 'computer';
  accountId: CloudProviderId;
  folderId: string | null;
}

export interface ConvertPanelProps {
  file: FileItem;
  duration: number;
  convertOptions: VideoConvertOptions;
  setConvertOptions: React.Dispatch<React.SetStateAction<VideoConvertOptions>>;
  isTranscoding: boolean;
  transcodeProgress: number;
  transcodeComplete: boolean;
  startTranscode: () => void;
  accounts: CloudAccount[];
  folders: FolderItem[];
  destination: SaveDestination;
  setDestination: React.Dispatch<React.SetStateAction<SaveDestination>>;
  baseName: string;
  defaultBaseName: string;
  setBaseName: (name: string) => void;
  isTrimmed: boolean;
  onEditTrim: () => void;
  savedLocalName: string | null;
  saveError: string | null;
  localFolderName: string | null;
  onBrowseLocal: () => void;
  handleSaveConvertedToCloud: () => void;
  handleSaveToComputer: () => void;
}

const LOCAL_OPTION = 'local';

const fieldClass = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-amber-500/60';
const labelClass = 'text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2';

export const ConvertPanel: React.FC<ConvertPanelProps> = ({
  file, duration, convertOptions, setConvertOptions, isTranscoding, transcodeProgress, transcodeComplete, startTranscode,
  accounts, folders, destination, setDestination, baseName, defaultBaseName, setBaseName, isTrimmed, onEditTrim,
  savedLocalName, saveError, localFolderName, onBrowseLocal, handleSaveConvertedToCloud, handleSaveToComputer,
}) => {
  const clipLength = Math.max(0, convertOptions.trimEnd - convertOptions.trimStart);
  const outputFileName = `${baseName.trim() || defaultBaseName}.${convertOptions.format}`;
  const saveableFolders = folders.filter(f => f.id !== 'f-trash' && f.id !== 'f-applications');
  const destinationAccount = accounts.find(a => a.id === destination.accountId);
  const destinationFolder = saveableFolders.find(f => f.id === destination.folderId);
  const destinationLabel = destination.kind === 'cloud'
    ? `${destinationAccount?.name ?? 'Cloud'} / ${destinationFolder?.name ?? 'Top level'}`
    : localFolderName ? `${localFolderName} on this computer` : 'This computer';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-neutral-100 font-semibold text-sm">
          <RefreshCw className="w-4 h-4 text-amber-400" />
          <span>Transcode & Convert</span>
        </div>
        <p className="text-xs text-neutral-400 mt-1">
          Choose a format, then where to save it.
        </p>
      </div>

      {/* Clip being converted */}
      <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800 flex items-center gap-3">
        <div className="w-8 h-8 shrink-0 rounded-md bg-amber-400/15 text-amber-300 flex items-center justify-center">
          <Scissors className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-neutral-100 truncate">{file.name}</div>
          <div className="text-[11px] text-neutral-400 font-mono">
            {isTrimmed
              ? `${formatTimecode(convertOptions.trimStart)} to ${formatTimecode(convertOptions.trimEnd)} (${formatTimecode(clipLength)})`
              : `Full video (${formatTimecode(duration)})`}
          </div>
        </div>
        <button onClick={onEditTrim} className="text-[11px] text-amber-300 hover:text-amber-200 shrink-0">
          {isTrimmed ? 'Edit trim' : 'Trim'}
        </button>
      </div>

      {/* Target Format */}
      <div>
        <label className={labelClass}>Format</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'mp4', label: 'MP4 (H.264 / AAC)', desc: 'Universal Cinema' },
            { id: 'mkv', label: 'MKV (H.264)', desc: 'Archive' },
            { id: 'webm', label: 'WebM (VP9 / Opus)', desc: 'Optimized Web' },
            { id: 'avi', label: 'AVI (MPEG-4)', desc: 'Legacy Playback' },
            { id: 'gif', label: 'Animated GIF', desc: 'Loop Preview' },
            { id: 'mp3', label: 'MP3 / Audio Only', desc: 'Audio Track' },
            { id: 'aac', label: 'AAC', desc: 'Compact Audio' },
            { id: 'wav', label: 'WAV', desc: 'Uncompressed Audio' },
            { id: 'flac', label: 'FLAC', desc: 'Lossless Audio' },
          ].map(fmt => (
            <button
              key={fmt.id}
              onClick={() => setConvertOptions(prev => ({ ...prev, format: fmt.id as VideoConvertOptions['format'] }))}
              className={`p-2.5 rounded-lg border text-left transition-colors ${
                convertOptions.format === fmt.id
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                  : 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="font-semibold text-xs">{fmt.label}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{fmt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Resolution if not audio */}
      {!isAudioConvertFormat(convertOptions.format) && (
        <div>
          <label className={labelClass}>Resolution</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: '720p', label: '720p (HD)' },
              { id: '1080p', label: '1080p (FHD)' },
              { id: '2k', label: '2K (1440p)' },
              { id: '4k', label: '4K UHD (2160p)' },
            ].map(res => (
              <button
                key={res.id}
                onClick={() => setConvertOptions(prev => ({ ...prev, resolution: res.id as VideoConvertOptions['resolution'] }))}
                className={`py-2 px-2 text-xs rounded-lg border text-center transition-colors ${
                  convertOptions.resolution === res.id
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-medium'
                    : 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quality & Bitrate */}
      <div>
        <label className={labelClass}>Encoding Profile</label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { id: 'lossless', label: 'Master / Lossless' },
            { id: 'high', label: 'High (CRF 18)' },
            { id: 'balanced', label: 'Balanced (CRF 23)' },
            { id: 'compact', label: 'Compact Web' },
          ].map(q => (
            <button
              key={q.id}
              onClick={() => setConvertOptions(prev => ({ ...prev, quality: q.id as VideoConvertOptions['quality'] }))}
              className={`py-2 px-3 rounded-lg border text-left transition-colors ${
                convertOptions.quality === q.id
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-medium'
                  : 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save destination */}
      <div>
        <label className={labelClass}>Save to</label>
        <div className={`grid gap-2 mb-3 ${destination.kind === 'cloud' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <span className="text-[10px] text-neutral-500 block mb-1">Location</span>
            <div className="flex items-center gap-2">
              <select
                value={destination.kind === 'computer' ? LOCAL_OPTION : destination.accountId}
                onChange={e => {
                  const value = e.target.value;
                  setDestination(prev =>
                    value === LOCAL_OPTION
                      ? { ...prev, kind: 'computer' }
                      : { kind: 'cloud', accountId: value as CloudProviderId, folderId: prev.folderId }
                  );
                }}
                className={`${fieldClass} flex-1 min-w-0`}
              >
                <optgroup label="Local">
                  <option value={LOCAL_OPTION}>This computer</option>
                </optgroup>
                {accounts.length > 0 && (
                  <optgroup label="Cloud accounts">
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {destination.kind === 'computer' && (
                <button
                  type="button"
                  onClick={onBrowseLocal}
                  className="h-[35px] px-3 shrink-0 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-neutral-100 flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-300" />
                  <span>Browse</span>
                </button>
              )}
            </div>
          </div>

          {destination.kind === 'cloud' && (
            <div>
              <span className="text-[10px] text-neutral-500 block mb-1">Folder</span>
              <select
                value={destination.folderId ?? ''}
                onChange={e => setDestination(prev => ({ ...prev, folderId: e.target.value || null }))}
                className={fieldClass}
              >
                <option value="">Top level</option>
                {saveableFolders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {destination.kind === 'computer' && (
          <div className="mb-3">
            <span className="text-[10px] text-neutral-500 block mb-1">File path</span>
            <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800">
              <Monitor className="w-3.5 h-3.5 shrink-0 mt-px text-neutral-500" />
              {localFolderName ? (
                <span className="font-mono text-[11px] text-neutral-200 break-all">{localFolderName}/{outputFileName}</span>
              ) : (
                <span className="text-[11px] text-neutral-500">No folder chosen. Press Browse.</span>
              )}
            </div>
          </div>
        )}

        <span className="text-[10px] text-neutral-500 block mb-1">File name</span>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={baseName}
            onChange={e => setBaseName(e.target.value)}
            placeholder={defaultBaseName}
            spellCheck={false}
            className={`${fieldClass} font-mono flex-1 min-w-0`}
          />
          <span className="text-xs font-mono text-neutral-400 shrink-0">.{convertOptions.format}</span>
        </div>
      </div>

      {/* Progress or Actions */}
      {isTranscoding ? (
        <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-300">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
              <span>Converting...</span>
            </span>
            <span className="font-mono text-amber-400 font-semibold">{transcodeProgress}%</span>
          </div>
          <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full transition-all duration-300 ease-out"
              style={{ width: `${transcodeProgress}%` }}
            />
          </div>
        </div>
      ) : transcodeComplete ? (
        <div className="p-4 bg-emerald-950/30 border border-emerald-700/50 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <Check className="w-4 h-4" />
            <span>Ready to save</span>
          </div>
          <p className="text-xs text-neutral-300">
            <span className="font-mono text-white break-all">{outputFileName}</span>
            <span className="text-neutral-400"> will be saved to {destinationLabel}.</span>
          </p>

          {savedLocalName ? (
            <p className="text-xs text-emerald-300">Saved as {savedLocalName}</p>
          ) : destination.kind === 'cloud' ? (
            <button
              onClick={handleSaveConvertedToCloud}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Save to {destinationAccount?.name ?? 'cloud storage'}</span>
            </button>
          ) : (
            <button
              onClick={handleSaveToComputer}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{localFolderName ? `Save to ${localFolderName}` : 'Choose location and save'}</span>
            </button>
          )}
          {saveError && <p className="text-xs text-red-300">{saveError}</p>}
        </div>
      ) : (
        <button
          onClick={startTranscode}
          className="w-full py-3 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-500/20"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Convert</span>
        </button>
      )}
    </div>
  );
};
