/**
 * Terminal split panes, saved sessions and key bindings.
 * Run: npx tsx scripts/terminal-layout-test.mts
 */
import {
  neighbourPane, paneIds, paneRects, removePane, splitPane, isValidLayout, type PaneLayout,
} from '../src/utils/terminalLayout.ts';
import { joinBufferRows, parseSavedSession, sanitizeRestoredText } from '../src/utils/terminalSession.ts';
import { translateKey } from '../src/utils/terminalKeys.ts';

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log('Splitting and closing panes');
let layout: PaneLayout = { pane: 'a' };
layout = splitPane(layout, 'a', 'b', 'column');
check('⌘D on a single pane stacks two', same(layout, { dir: 'column', children: [{ pane: 'a' }, { pane: 'b' }] }));
layout = splitPane(layout, 'a', 'c', 'column');
check('splitting the same way adds a sibling after the pane', same(paneIds(layout), ['a', 'c', 'b']) && 'dir' in layout && layout.children.length === 3);
layout = splitPane(layout, 'b', 'd', 'row');
check('splitting across nests', same(layout, {
  dir: 'column', children: [{ pane: 'a' }, { pane: 'c' }, { dir: 'row', children: [{ pane: 'b' }, { pane: 'd' }] }],
}));
const rects = paneRects(layout);
check('panes share the space evenly', Math.abs(rects.get('b')!.width - 0.5) < 1e-9 && Math.abs(rects.get('a')!.height - 1 / 3) < 1e-9);
check('⌘⌥↓ from the top pane goes to the next one down', neighbourPane(rects, 'a', 'down') === 'c');
check('⌘⌥↓ from the middle reaches the left of the split row', neighbourPane(rects, 'c', 'down') === 'b');
check('⌘⌥→ moves within the row', neighbourPane(rects, 'b', 'right') === 'd');
check('⌘⌥↑ from the right half goes up to the full-width pane', neighbourPane(rects, 'd', 'up') === 'c');
check('nothing past the edge', neighbourPane(rects, 'a', 'up') === null && neighbourPane(rects, 'd', 'right') === null);
let closed = removePane(layout, 'd');
check('closing one of two in a row collapses the row', same(closed, { dir: 'column', children: [{ pane: 'a' }, { pane: 'c' }, { pane: 'b' }] }));
closed = removePane(removePane(closed!, 'a')!, 'c');
check('down to one pane, no split remains', same(closed, { pane: 'b' }));
check('closing the last pane leaves nothing', removePane({ pane: 'x' }, 'x') === null);
const nested: PaneLayout = { dir: 'row', children: [{ pane: 'a' }, { dir: 'column', children: [{ pane: 'b' }, { dir: 'row', children: [{ pane: 'c' }, { pane: 'd' }] }] }] };
check('a collapsed split running the same way folds into its parent', same(removePane(nested, 'b'), { dir: 'row', children: [{ pane: 'a' }, { pane: 'c' }, { pane: 'd' }] }));

console.log('Layouts read back from disk');
check('a good layout is accepted', isValidLayout(layout, new Set(['a', 'b', 'c', 'd'])));
check('a layout naming an unknown pane is refused', !isValidLayout({ pane: 'z' }, new Set(['a'])));
check('a pane listed twice is refused', !isValidLayout({ dir: 'row', children: [{ pane: 'a' }, { pane: 'a' }] }, new Set(['a'])));
check('a layout missing a pane is refused', !isValidLayout({ pane: 'a' }, new Set(['a', 'b'])));
check('a one-child split is refused', !isValidLayout({ dir: 'row', children: [{ pane: 'a' }] }, new Set(['a'])));

console.log('Saved sessions');
const good = {
  version: 1, savedAt: '2026-10-12T10:00:00Z', activeTab: 't2',
  tabs: [
    { id: 't1', profileId: 'pro', focusedPane: 'p1', layout: { pane: 'p1' }, panes: [{ id: 'p1', cwd: '/Users/me', title: 'zsh', text: 'ls\nfile' }] },
    { id: 't2', profileId: 'nope', focusedPane: 'gone', layout: { dir: 'row', children: [{ pane: 'p2' }, { pane: 'p3' }] }, panes: [{ id: 'p2', cwd: 'relative' }, { id: 'p3' }] },
  ],
};
const parsed = parseSavedSession(JSON.stringify(good));
check('a saved session parses', parsed?.tabs.length === 2 && parsed.activeTab === 't2');
check('an unknown profile falls back to Cloudbreak', parsed?.tabs[1].profileId === 'cloudbreak');
check('a focused pane that is not there falls back to the first', parsed?.tabs[1].focusedPane === 'p2');
check('a relative folder is dropped', parsed?.tabs[1].panes[0].cwd === undefined && parsed?.tabs[0].panes[0].cwd === '/Users/me');
check('another version is ignored', parseSavedSession(JSON.stringify({ ...good, version: 2 })) === null);
check('broken JSON is ignored', parseSavedSession('{"tabs":') === null && parseSavedSession(null) === null);
check('a layout that does not match its panes is ignored', parseSavedSession(JSON.stringify({
  ...good, tabs: [{ ...good.tabs[0], layout: { pane: 'other' } }],
})) === null);
check('odd ids are ignored', parseSavedSession(JSON.stringify({ ...good, tabs: [{ ...good.tabs[0], id: '../x' }] })) === null);

console.log('Restored output');
const esc = sanitizeRestoredText('ok\x1b]52;c;ZXZpbA==\x07 \x1b[31mred\r\nnext\ttab');
check('escape sequences cannot ride along', !esc.includes('\x1b') && !esc.includes('\x07') && esc.includes('next\ttab') && esc.startsWith('ok'));
check('line endings become newlines', sanitizeRestoredText('a\r\nb\rc') === 'a\nb\nc');
check('soft-wrapped rows join and trailing blanks go', joinBufferRows([
  { text: 'abc', isWrapped: false }, { text: 'def  ', isWrapped: true }, { text: 'g', isWrapped: false }, { text: '   ', isWrapped: false },
]) === 'abcdef\ng');
check('only the last lines are kept', joinBufferRows(['1', '2', '3'].map(text => ({ text, isWrapped: false })), 2) === '2\n3');

console.log('Keys');
const key = (k: string, mods: Partial<{ metaKey: boolean; altKey: boolean; shiftKey: boolean; ctrlKey: boolean }> = {}) =>
  translateKey({ key: k, metaKey: false, altKey: false, shiftKey: false, ctrlKey: false, ...mods });
check('⌘D splits top and bottom', same(key('d', { metaKey: true }), { type: 'action', action: 'splitDown' }));
check('⌘⇧D splits side by side', key('D', { metaKey: true, shiftKey: true })?.type === 'action' && (key('D', { metaKey: true, shiftKey: true }) as { action: string }).action === 'splitRight');
check('⌘W closes the pane', (key('w', { metaKey: true }) as { action: string }).action === 'close');
check('⌘] / ⌘[ cycle panes, ⌘⇧] / ⌘⇧[ cycle tabs',
  (key(']', { metaKey: true }) as { action: string }).action === 'nextPane'
  && (key('[', { metaKey: true }) as { action: string }).action === 'previousPane'
  && (key('}', { metaKey: true, shiftKey: true }) as { action: string }).action === 'nextTab');
check('⌘↑ / ⌘↓ jump between marks',
  (key('ArrowUp', { metaKey: true }) as { action: string }).action === 'previousMark'
  && (key('ArrowDown', { metaKey: true }) as { action: string }).action === 'nextMark');
check('⌘⌥← focuses the pane to the left', same(key('ArrowLeft', { metaKey: true, altKey: true }), { type: 'action', action: 'focusPane', direction: 'left' }));
check('⌘← still goes to the start of the line', same(key('ArrowLeft', { metaKey: true }), { type: 'send', data: '\x01' }));

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll terminal layout checks passed');
