import React from 'react';
import { Play, Scissors, Sliders } from 'lucide-react';
import { formatTimecode } from '../../utils/format';

export interface TrimPanelProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  setTrimStart: (value: number) => void;
  trimEnd: number;
  setTrimEnd: (value: number) => void;
  playTrimLoop: () => void;
  handleSaveTrim: () => void;
}

export const TrimPanel: React.FC<TrimPanelProps> = ({ duration, currentTime, trimStart, setTrimStart, trimEnd, setTrimEnd, playTrimLoop, handleSaveTrim }) => (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 text-neutral-100 font-semibold text-sm">
                  <Scissors className="w-4 h-4 text-cyan-400" />
                  <span>Timeline Trimmer</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Set In and Out markers to trim unwanted heads or tails without loss of resolution.
                </p>
              </div>

              {/* IN & OUT Markers Sliders */}
              <div className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-4">
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-neutral-400 font-medium">In-Point (Start)</span>
                    <span className="font-mono text-cyan-400 font-semibold">{formatTimecode(trimStart, true)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={trimEnd - 0.1}
                    step={0.05}
                    value={trimStart}
                    onChange={e => setTrimStart(parseFloat(e.target.value))}
                    className="w-full custom-range"
                  />
                  <button
                    onClick={() => setTrimStart(currentTime)}
                    className="mt-1.5 text-[11px] text-cyan-400 hover:underline"
                  >
                    Set to Current Time ({formatTimecode(currentTime, true)})
                  </button>
                </div>

                <div className="pt-3 border-t border-neutral-850">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-neutral-400 font-medium">Out-Point (End)</span>
                    <span className="font-mono text-cyan-400 font-semibold">{formatTimecode(trimEnd, true)}</span>
                  </div>
                  <input
                    type="range"
                    min={trimStart + 0.1}
                    max={duration}
                    step={0.05}
                    value={trimEnd}
                    onChange={e => setTrimEnd(parseFloat(e.target.value))}
                    className="w-full custom-range"
                  />
                  <button
                    onClick={() => setTrimEnd(currentTime)}
                    className="mt-1.5 text-[11px] text-cyan-400 hover:underline"
                  >
                    Set to Current Time ({formatTimecode(currentTime, true)})
                  </button>
                </div>

                {/* Cut Summary */}
                <div className="p-3 bg-neutral-900 rounded-lg text-xs space-y-1.5 border border-neutral-800">
                  <div className="flex justify-between text-neutral-400">
                    <span>Resulting Clip Length:</span>
                    <span className="font-mono text-neutral-100 font-semibold">
                      {formatTimecode(Math.max(0, trimEnd - trimStart), true)}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Original Length:</span>
                    <span className="font-mono text-neutral-400">{formatTimecode(duration, true)}</span>
                  </div>
                </div>
              </div>

              {/* Trim Actions */}
              <div className="space-y-2.5">
                <button
                  onClick={playTrimLoop}
                  className="w-full py-2.5 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Loop Preview Cut Range</span>
                </button>

                <button
                  onClick={handleSaveTrim}
                  className="w-full py-2.5 px-4 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-500/20"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Save Trimmed Clip to Cloud Storage</span>
                </button>
              </div>
            </div>
);
