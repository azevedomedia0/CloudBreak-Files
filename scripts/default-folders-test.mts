/**
 * The placeholder Local Files list in the sidebar: no Applications folder on Linux.
 * Run: npx tsx scripts/default-folders-test.mts
 */
import { createDefaultLocalFolders } from '../src/utils/defaultLocalFolders.ts';

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}
const names = (linux: boolean) => createDefaultLocalFolders(linux).map(f => f.name).join(',');
check('macOS keeps Applications last', names(false) === 'Desktop,Documents,Photos,Videos,Music,Downloads,Applications', names(false));
check('Linux has no Applications', names(true) === 'Desktop,Documents,Photos,Videos,Music,Downloads', names(true));
check('the other folders keep their ids on Linux', createDefaultLocalFolders(true).every(f => f.id.startsWith('folder-local-') && f.id !== 'folder-local-applications'));

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll default folder checks passed');
