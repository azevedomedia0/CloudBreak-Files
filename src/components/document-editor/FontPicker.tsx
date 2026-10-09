import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from '@/src/icons';
import {
  DEFAULT_DOC_FONT,
  ensureGoogleFontLoaded,
  filterGoogleFonts,
  GOOGLE_FONT_FAMILIES,
  SYSTEM_FONTS,
  fontStackFor,
} from '../../utils/googleFonts';

interface FontPickerProps {
  value: string;
  onChange: (family: string) => void;
  onCaptureSelection: () => void;
  className?: string;
}

export const FontPicker: React.FC<FontPickerProps> = ({
  value, onChange, onCaptureSelection, className = '',
}) => {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const systemMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SYSTEM_FONTS.filter(item => !needle || item.family.toLowerCase().includes(needle));
  }, [query]);

  const googleMatches = useMemo(() => filterGoogleFonts(query, 300), [query]);
  const totalGoogle = GOOGLE_FONT_FAMILIES.length;

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (family: string) => {
    ensureGoogleFontLoaded(family);
    onChange(family);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        title="Font"
        aria-label="Font"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onMouseDown={onCaptureSelection}
        onClick={() => setOpen(current => !current)}
        className="h-8 w-[11.5rem] max-w-[11.5rem] pl-2 pr-1.5 rounded-lg bg-neutral-950/80 border border-white/10 text-xs text-neutral-100 flex items-center gap-1 hover:border-white/20 focus:outline-none focus:border-orange-400/50"
      >
        <span className="truncate" style={{ fontFamily: fontStackFor(value || DEFAULT_DOC_FONT) }}>
          {value || DEFAULT_DOC_FONT}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 rounded-xl border border-white/10 bg-neutral-950 shadow-2xl shadow-black/50 overflow-hidden"
        >
          <div className="p-2 border-b border-white/8">
            <input
              ref={searchRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={`Search ${totalGoogle.toLocaleString()} Google Fonts…`}
              className="w-full h-8 px-2.5 rounded-lg bg-neutral-900 border border-white/10 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-orange-400/50"
              aria-label="Search fonts"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {systemMatches.length > 0 && (
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                System
              </div>
            )}
            {systemMatches.map(item => (
              <FontOption
                key={item.family}
                family={item.family}
                stack={item.stack}
                active={value === item.family}
                onPick={pick}
              />
            ))}
            <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Google Fonts
              <span className="ml-1 font-mono normal-case tracking-normal text-neutral-600">
                {query.trim() ? `${googleMatches.length}${googleMatches.length >= 300 ? '+' : ''}` : totalGoogle.toLocaleString()}
              </span>
            </div>
            {googleMatches.map(family => (
              <FontOption
                key={family}
                family={family}
                stack={fontStackFor(family)}
                active={value === family}
                onPick={pick}
                onHover={() => ensureGoogleFontLoaded(family)}
              />
            ))}
            {systemMatches.length === 0 && googleMatches.length === 0 && (
              <p className="px-3 py-4 text-xs text-neutral-500">No fonts match.</p>
            )}
            {!query.trim() && (
              <p className="px-3 py-2 text-[10px] text-neutral-600 leading-relaxed">
                Type to browse all {totalGoogle.toLocaleString()} Google Fonts. Faces load when selected.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function FontOption({
  family, stack, active, onPick, onHover,
}: {
  family: string;
  stack: string;
  active: boolean;
  onPick: (family: string) => void;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={() => onPick(family)}
      className={`w-full px-3 py-1.5 text-left text-xs truncate transition-colors ${
        active ? 'bg-orange-500/20 text-orange-100' : 'text-neutral-200 hover:bg-white/6'
      }`}
      style={{ fontFamily: stack }}
    >
      {family}
    </button>
  );
}
