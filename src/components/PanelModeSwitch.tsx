import React from 'react';
import { ListMusic } from '@/src/icons';
import { FileInspectorIcon } from './file-browser/FileInspectorIcon';

export type RightPanelMode = 'inspector' | 'queue';

interface PanelModeSwitchProps {
  mode: RightPanelMode;
  onChange: (mode: RightPanelMode) => void;
}

const OPTIONS: { id: RightPanelMode; label: string; icon: React.ReactNode }[] = [
  { id: 'inspector', label: 'File Inspector', icon: <FileInspectorIcon className="w-3.5 h-3.5" /> },
  { id: 'queue', label: 'Playing Next', icon: <ListMusic className="w-3.5 h-3.5" /> },
];

/** Two-way switch shown in the right panel's header. Picking the mode already showing changes nothing. */
export const PanelModeSwitch: React.FC<PanelModeSwitchProps> = ({ mode, onChange }) => (
  <div
    role="tablist"
    aria-label="Right panel"
    className="inline-flex items-center rounded-lg border border-white/10 bg-black/20 p-0.5 gap-0.5"
  >
    {OPTIONS.map(option => {
      const selected = option.id === mode;
      return (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={selected}
          onClick={() => { if (!selected) onChange(option.id); }}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
            selected
              ? 'text-sky-300 bg-sky-400/15'
              : 'text-neutral-400 hover:text-white hover:bg-white/10'
          }`}
        >
          {option.icon}
          {option.label}
        </button>
      );
    })}
  </div>
);
