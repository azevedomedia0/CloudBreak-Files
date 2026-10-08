import GOOGLE_FONTS from '../data/googleFonts.json';

export const SYSTEM_FONTS = [
  { family: 'Georgia', stack: 'Georgia, "Iowan Old Style", Palatino, serif' },
  { family: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { family: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { family: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { family: 'system-ui', stack: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' },
] as const;

/** Full Google Fonts catalog (family names). */
export const GOOGLE_FONT_FAMILIES: readonly string[] = GOOGLE_FONTS;

export const DEFAULT_DOC_FONT = 'Georgia';

const loadedFonts = new Set<string>(['Newsreader', 'Plus Jakarta Sans', 'JetBrains Mono']);

export function isGoogleFont(family: string): boolean {
  return GOOGLE_FONT_FAMILIES.some(name => name.toLowerCase() === family.toLowerCase());
}

export function fontStackFor(family: string): string {
  const system = SYSTEM_FONTS.find(item => item.family.toLowerCase() === family.toLowerCase());
  if (system) return system.stack;
  const quoted = /[^a-zA-Z0-9-]/.test(family) ? `"${family}"` : family;
  return `${quoted}, sans-serif`;
}

/** Inject a stylesheet for a Google Font the first time it is used. */
export function ensureGoogleFontLoaded(family: string): void {
  if (typeof document === 'undefined') return;
  if (!isGoogleFont(family)) return;
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);

  const id = `gfont-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  // Default face only — avoids 400s for families that lack italic/bold axes.
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  document.head.appendChild(link);
}

export function normalizeFontFamily(value: string): string {
  const primary = value.replace(/['"]/g, '').split(',')[0]?.trim() ?? '';
  if (!primary) return DEFAULT_DOC_FONT;

  const system = SYSTEM_FONTS.find(item => item.family.toLowerCase() === primary.toLowerCase());
  if (system) return system.family;

  const exact = GOOGLE_FONT_FAMILIES.find(name => name.toLowerCase() === primary.toLowerCase());
  if (exact) {
    ensureGoogleFontLoaded(exact);
    return exact;
  }

  return primary;
}

export function filterGoogleFonts(query: string, limit = 250): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return GOOGLE_FONT_FAMILIES.slice(0, limit);
  const matches: string[] = [];
  for (const family of GOOGLE_FONT_FAMILIES) {
    if (family.toLowerCase().includes(needle)) {
      matches.push(family);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
