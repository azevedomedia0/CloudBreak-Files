/**
 * The sentence Incoming Libraries' refresh button reports.
 * Run: npx tsx scripts/incoming-refresh-test.mts
 */
import { summarizeIncomingRefresh, type IncomingRefresh } from '../src/utils/incomingRefresh.ts';

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}
const lib = (name: string, status: string, fetchedChunks = 0, missingChunks = 0): IncomingRefresh =>
  ({ libraryId: name, name, status, fetchedChunks, missingChunks });

const none = summarizeIncomingRefresh([]);
check('no libraries: says a library arrives as an invite', none === 'No incoming libraries yet. A library arrives when its owner sends you an invite.', none);
const ok = summarizeIncomingRefresh([lib('Trip', 'synced'), lib('Wedding', 'synced')]);
check('all complete: up to date, and where new libraries come from', ok === '2 libraries are up to date. New libraries arrive as an invite from their owner.', ok);
check('one library uses the singular', summarizeIncomingRefresh([lib('Trip', 'synced')]).startsWith('1 library is up to date'));
const got = summarizeIncomingRefresh([lib('Trip', 'synced', 4)]);
check('new files are reported', /received new files for 1 library/.test(got), got);
const off = summarizeIncomingRefresh([lib('Trip', 'synced'), lib('Wedding', 'offline', 0, 3)]);
check('an unreachable sender is named', off === '1 library is up to date · could not finish "Wedding" (the sender may be offline).', off);
const many = summarizeIncomingRefresh([lib('A', 'offline'), lib('B', 'offline'), lib('C', 'partial'), lib('D', 'offline')]);
check('long lists are cut short', /"A", "B" and 2 more/.test(many), many);
const exp = summarizeIncomingRefresh([lib('Old', 'expired', 0, 2)]);
check('an expired invite is said so', /invite for "Old" has expired/.test(exp), exp);
check('problems do not repeat the "new libraries" hint', !/arrive as an invite/.test(off) && !/arrive as an invite/.test(exp));

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll incoming refresh checks passed');
