import React from 'react';
import { RefreshCw, Download, Check, Sparkles, HardDrive } from 'lucide-react';
import { VideoConvertOptions, FileItem } from '../../types';

export interface ConvertPanelProps {
  file: FileItem;
  duration: number;
  convertOptions: VideoConvertOptions;
  setConvertOptions: React.Dispatch<React.SetStateAction<VideoConvertOptions>>;
  isTranscoding: boolean;
  transcodeProgress: number;
  transcodeComplete: boolean;
  startTranscode: () => void;
  handleSaveConvertedToCloud: () => void;
  handleDownloadConverted: () => void;
}

export const ConvertPanel: React.FC<ConvertPanelProps> = ({ file, duration, convertOptions, setConvertOptions, isTranscoding, transcodeProgress, transcodeComplete, startTranscode, handleSaveConvertedToCloud, handleDownloadConverted }) => (
  <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 text-neutral-100 font-semibold text-sm">
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                  <span>Transcode & Convert</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Convert container, transcode codecs, optimize resolutions, or extract lossless audio.
                </p>
              </div>

              {/* Target Format */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                  Target Container & Codec
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'mp4', label: 'MP4 (H.264 / AAC)', desc: 'Universal Cinema' },
                    { id: 'webm', label: 'WebM (VP9 / Opus)', desc: 'Optimized Web' },
                    { id: 'gif', label: 'Animated GIF', desc: 'Loop Preview' },
                    { id: 'mp3', label: 'MP3 / Audio Only', desc: 'Audio Track' },
                  ].map(fmt => (
                    <button
                      key={fmt.id}
                      onClick={() => setConvertOptions(prev => ({ ...prev, format: fmt.id as any }))}
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
              {convertOptions.format !== 'mp3' && (
                <div>
                  <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                    Resolution Preset
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '4k', label: '4K UHD (2160p)' },
                      { id: '1080p', label: '1080p (FHD)' },
                      { id: '720p', label: '720p (HD)' },
                    ].map(res => (
                      <button
                        key={res.id}
                        onClick={() => setConvertOptions(prev => ({ ...prev, resolution: res.id as any }))}
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
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                  Encoding Profile
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'lossless', label: 'Master / Lossless' },
                    { id: 'high', label: 'High (CRF 18)' },
                    { id: 'balanced', label: 'Balanced (CRF 23)' },
                    { id: 'compact', label: 'Compact Web' },
                  ].map(q => (
                    <button
                      key={q.id}
                      onClick={() => setConvertOptions(prev => ({ ...prev, quality: q.id as any }))}
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

              {/* Progress or Actions */}
              {isTranscoding ? (
                <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-neutral-300">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                      <span>Hardware Accelerated Transcoding...</span>
                    </span>
                    <span className="font-mono text-amber-400 font-semibold">{transcodeProgress}%</span>
                  </div>
                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full transition-all duration-300 ease-out"
                      style={{ width: `${transcodeProgress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Encoding WebAssembly pass with multi-threaded ffmpeg pipeline.
                  </p>
                </div>
              ) : transcodeComplete ? (
                <div className="p-4 bg-emerald-950/30 border border-emerald-700/50 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <Check className="w-4 h-4" />
                    <span>Transcoding Complete!</span>
                  </div>
                  <p className="text-xs text-neutral-300">
                    Converted file ready as <span className="font-mono text-white">{convertOptions.format.toUpperCase()}</span>.
                  </p>

                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={handleSaveConvertedToCloud}
                      className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Save Converted to Cloud Storage</span>
                    </button>
                    <button
                      onClick={handleDownloadConverted}
                      className="w-full py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 text-xs font-medium flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download to Local Disk</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startTranscode}
                  className="w-full py-3 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-500/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Start Transcode & Convert</span>
                </button>
              )}
  </div>
);
