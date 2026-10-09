import React from 'react';
import { CheckSquare, Square } from '@/src/icons';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';

export interface HoverSelectCheckboxProps {
  accent: SelectionAccent;
  selected: boolean;
  onToggle: (e: React.MouseEvent) => void;
  /** Smaller control for compact / reel thumbnails. */
  compact?: boolean;
  className?: string;
}

/** Finder-style multi-select control: visible when selected or on parent `group` hover. */
export const HoverSelectCheckbox: React.FC<HoverSelectCheckboxProps> = ({
  accent,
  selected,
  onToggle,
  compact = false,
  className = '',
}) => {
  const iconCls = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={selected ? 'Deselect' : 'Select'}
      className={`absolute z-20 rounded-md backdrop-blur-md transition-opacity pointer-events-auto ${
        compact ? 'top-0.5 left-0.5 p-0.5' : 'top-1.5 left-1.5 p-0.5'
      } ${
        selected
          ? `${SELECTION_CLASSES[accent].checkIcon} bg-black/70 opacity-100`
          : 'text-neutral-200 bg-black/55 opacity-0 group-hover:opacity-100'
      } ${className}`}
    >
      {selected ? <CheckSquare className={iconCls} /> : <Square className={iconCls} />}
    </button>
  );
};
