import React from 'react';
import type { FormFieldInfo, FormValue } from '../../utils/pdfEdit';

/** The PDF's form fields as a list to fill in. The values are written into the saved copy. */
export const PdfFormPanel: React.FC<{
  fields: FormFieldInfo[];
  values: Record<string, FormValue>;
  onChange: (name: string, value: FormValue) => void;
}> = ({ fields, values, onChange }) => {
  const input = 'w-full h-8 px-2 rounded-md bg-neutral-950/80 border border-white/10 text-xs text-neutral-100 focus:outline-none focus:border-orange-400/50 disabled:opacity-50';
  return (
    <div className="w-64 shrink-0 border-l border-white/8 bg-neutral-950/70 overflow-y-auto p-3 space-y-3" aria-label="Form fields">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Form fields</div>
      <p className="text-[10px] text-neutral-500 leading-snug">Values are written when you save a copy. The page above updates in the copy.</p>
      {fields.map(f => {
        const value = f.name in values ? values[f.name] : f.value;
        return (
          <label key={f.name} className="block space-y-1">
            <span className="text-[11px] text-neutral-300 break-words">{f.name}{f.readOnly ? ' (read only)' : ''}</span>
            {f.kind === 'text' && (f.multiline
              ? <textarea disabled={f.readOnly} value={String(value)} onChange={e => onChange(f.name, e.target.value)} rows={3} className={`${input} h-auto py-1`} />
              : <input disabled={f.readOnly} value={String(value)} onChange={e => onChange(f.name, e.target.value)} className={input} />)}
            {f.kind === 'checkbox' && (
              <input type="checkbox" disabled={f.readOnly} checked={value === true} onChange={e => onChange(f.name, e.target.checked)} className="accent-orange-500" />
            )}
            {(f.kind === 'dropdown' || f.kind === 'radio') && (
              <select disabled={f.readOnly} value={String(value)} onChange={e => onChange(f.name, e.target.value)} className={input}>
                <option value="">(none)</option>
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.kind === 'list' && (
              <select multiple disabled={f.readOnly} value={Array.isArray(value) ? value : []} onChange={e => onChange(f.name, [...e.target.selectedOptions].map(o => o.value))} className={`${input} h-20`}>
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </label>
        );
      })}
    </div>
  );
};
