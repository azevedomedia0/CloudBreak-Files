/**
 * The display-only look inside an invite (what the new-invite notification shows).
 * Run: npx tsx scripts/invite-preview-test.mts
 */
import { looksLikeInvite, parseInvitePreview, shortPeerId } from '../src/utils/invitePreview.ts';

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}
const encode = (value: unknown) =>
  'aetherlib:1:' + Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const invite = {
  rootCid: 'ab'.repeat(32), libraryId: 'lib-1', libraryName: 'Holiday photos', seederPeerId: '1234567890abcdef',
  seederPublicKeyHex: 'aa', seederAddrs: ['/ip4/10.0.0.2/tcp/7421'], role: 'viewer', capabilitySig: 'bb',
  expiresAt: 1_900_000_000, epoch: 1, manifestNonceHex: 'cc', privateMode: true, accessToken: 'SECRET-TOKEN',
};

const p = parseInvitePreview(encode(invite));
check('a real invite is read', p?.libraryId === 'lib-1' && p.libraryName === 'Holiday photos' && p.seederPeerId === '1234567890abcdef' && p.role === 'viewer' && p.expiresAt === 1_900_000_000, JSON.stringify(p));
check('the access token is never part of the preview', !JSON.stringify(p).includes('SECRET'));
check('names with accents and emoji survive', parseInvitePreview(encode({ ...invite, libraryName: 'Été 🌴' }))?.libraryName === 'Été 🌴');
check('an invite with no expiry reads as 0', parseInvitePreview(encode({ ...invite, expiresAt: undefined }))?.expiresAt === 0);
check('surrounding whitespace is fine', parseInvitePreview('  \n' + encode(invite) + '\n')?.libraryName === 'Holiday photos');
check('looksLikeInvite sees the prefix', looksLikeInvite(' ' + encode(invite)) && !looksLikeInvite('hello') && !looksLikeInvite('aetherlib:2:abc'));
check('another prefix is not an invite', parseInvitePreview('aetherlib:2:' + 'x') === null);
check('bad base64 is not an invite', parseInvitePreview('aetherlib:1:***not base64***') === null);
check('JSON that is not an object is not an invite', parseInvitePreview(encode([1, 2])) === null && parseInvitePreview(encode('text')) === null);
check('missing fields are not an invite', parseInvitePreview(encode({ libraryId: 'x' })) === null && parseInvitePreview(encode({ ...invite, libraryName: '' })) === null);
check('absurdly long names are refused', parseInvitePreview(encode({ ...invite, libraryName: 'x'.repeat(500) })) === null);
check('invalid UTF-8 is refused', parseInvitePreview('aetherlib:1:' + Buffer.from([0xff, 0xfe, 0x7b]).toString('base64url')) === null);
check('a long peer id is shortened', shortPeerId('1234567890abcdef') === '12345678…' && shortPeerId('short') === 'short');

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll invite preview checks passed');
