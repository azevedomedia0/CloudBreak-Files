/**
 * Cross-test: Web Crypto ↔ Rust AES-256-GCM / PBKDF2 format.
 *
 * Reads tests/fixtures/crypto-interop.json (produced by Rust), then:
 *  1. Re-encrypts with the same salt/nonce and asserts ciphertext matches Rust
 *  2. Decrypts Rust passphrase + session payloads with Web Crypto
 *  3. Re-derives the vault verifier hash and session key fingerprint
 *
 * Run: npx tsx scripts/cross-crypto-roundtrip.mts
 * Or:  npm run test:crypto
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_DOMAIN = 'aethercloud-vault-verifier';
const SESSION_KEY_DOMAIN = 'aethercloud-file-session';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'tests', 'fixtures', 'crypto-interop.json');

interface EncryptedAsset {
  ciphertext: string;
  nonce: string;
  salt: string;
  keyFingerprint: string;
  sha256Checksum: string;
}

interface Fixture {
  passphrase: string;
  plaintext: string;
  plaintextHex: string;
  saltHex: string;
  nonceHex: string;
  pbkdf2Iterations: number;
  passphraseEncrypt: EncryptedAsset;
  sessionEncrypt: EncryptedAsset;
  sessionKeyFingerprint: string;
  verifier: { iterations: number; salt: string; hash: string };
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error(`Invalid hex: ${hex.slice(0, 32)}…`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const asBuffer = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

function domainSalt(domain: string, salt: Uint8Array): Uint8Array {
  const domainBytes = new TextEncoder().encode(domain);
  const out = new Uint8Array(domainBytes.length + salt.length);
  out.set(domainBytes, 0);
  out.set(salt, domainBytes.length);
  return out;
}

async function deriveKeyBytes(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    256
  );
  return new Uint8Array(bits);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', asBuffer(data))));
}

async function fingerprint(keyBytes: Uint8Array): Promise<string> {
  const hash = await sha256Hex(keyBytes);
  return hash.slice(0, 16).match(/.{2}/g)!.join(':');
}

async function aesEncrypt(
  data: Uint8Array,
  keyBytes: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', asBuffer(keyBytes), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(nonce) }, key, asBuffer(data))
  );
}

async function aesDecrypt(
  ciphertext: Uint8Array,
  keyBytes: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', asBuffer(keyBytes), { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuffer(nonce) }, key, asBuffer(ciphertext))
  );
}

function assertEq(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`${label}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

function assertBytesEq(label: string, actual: Uint8Array, expected: Uint8Array): void {
  assertEq(label, toHex(actual), toHex(expected));
}

async function main(): Promise<void> {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
  const salt = fromHex(fixture.saltHex);
  const nonce = fromHex(fixture.nonceHex);
  const plain = new TextEncoder().encode(fixture.plaintext);
  const iterations = fixture.pbkdf2Iterations || PBKDF2_ITERATIONS;

  console.log('Cross-crypto round-trip (Web Crypto ↔ Rust fixtures)');
  console.log(`  fixture: ${fixturePath}`);
  console.log(`  plaintext: ${JSON.stringify(fixture.plaintext)}`);

  // —— Passphrase encrypt: Web must match Rust ciphertext byte-for-byte ——
  const passKey = await deriveKeyBytes(fixture.passphrase, salt, iterations);
  const passCipher = await aesEncrypt(plain, passKey, nonce);
  assertEq('passphrase ciphertext', toHex(passCipher), fixture.passphraseEncrypt.ciphertext);
  assertEq(
    'passphrase key fingerprint',
    await fingerprint(passKey),
    fixture.passphraseEncrypt.keyFingerprint
  );
  assertEq('passphrase sha256', await sha256Hex(plain), fixture.passphraseEncrypt.sha256Checksum);
  console.log('  ✓ Web Crypto passphrase encrypt matches Rust ciphertext');

  // —— Passphrase decrypt: Web decrypts Rust payload ——
  const passPlain = await aesDecrypt(
    fromHex(fixture.passphraseEncrypt.ciphertext),
    passKey,
    fromHex(fixture.passphraseEncrypt.nonce)
  );
  assertBytesEq('passphrase decrypt', passPlain, plain);
  console.log('  ✓ Web Crypto decrypts Rust passphrase payload');

  // —— Session key: domain-separated from verifier ——
  const sessionKey = await deriveKeyBytes(
    fixture.passphrase,
    domainSalt(SESSION_KEY_DOMAIN, salt),
    iterations
  );
  assertEq('session key fingerprint', await fingerprint(sessionKey), fixture.sessionKeyFingerprint);
  const sessionCipher = await aesEncrypt(plain, sessionKey, nonce);
  assertEq('session ciphertext', toHex(sessionCipher), fixture.sessionEncrypt.ciphertext);
  console.log('  ✓ Web Crypto session encrypt matches Rust ciphertext');

  const sessionPlain = await aesDecrypt(
    fromHex(fixture.sessionEncrypt.ciphertext),
    sessionKey,
    fromHex(fixture.sessionEncrypt.nonce)
  );
  assertBytesEq('session decrypt', sessionPlain, plain);
  console.log('  ✓ Web Crypto decrypts Rust session payload');

  // —— Session and passphrase keys must differ ——
  if (toHex(sessionKey) === toHex(passKey)) {
    throw new Error('session key must not equal passphrase-derived file salt key');
  }
  console.log('  ✓ Session key ≠ passphrase key (domain separation)');

  // —— Vault verifier hash ——
  const verifierKey = await deriveKeyBytes(
    fixture.passphrase,
    domainSalt(VERIFIER_DOMAIN, fromHex(fixture.verifier.salt)),
    fixture.verifier.iterations
  );
  assertEq('verifier hash', toHex(verifierKey), fixture.verifier.hash);
  console.log('  ✓ Web Crypto verifier hash matches Rust');

  // —— Wrong passphrase must fail decrypt ——
  const wrongKey = await deriveKeyBytes('wrong passphrase!!', salt, iterations);
  let failed = false;
  try {
    await aesDecrypt(fromHex(fixture.passphraseEncrypt.ciphertext), wrongKey, nonce);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('wrong passphrase should fail decrypt');
  console.log('  ✓ Wrong passphrase fails decrypt');

  passKey.fill(0);
  sessionKey.fill(0);
  wrongKey.fill(0);
  verifierKey.fill(0);

  console.log('\nAll cross-crypto checks passed.');
}

main().catch(err => {
  console.error('\nCross-crypto FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
