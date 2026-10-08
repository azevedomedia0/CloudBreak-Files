/**
 * Smoke test: browser vault verifier survives a simulated reload.
 * Run: npx tsx scripts/browser-vault-persist-test.mts
 */

import { webcrypto } from 'node:crypto';

// Node needs Web Crypto + a localStorage stand-in before importing the bridge.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

if (!(globalThis as { crypto?: Crypto }).crypto) {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

const { clearBrowserVerifier, loadBrowserVerifier, saveBrowserVerifier } = await import(
  '../src/services/browserVaultStore.ts'
);
const { rustBridge } = await import('../src/services/rustBridge.ts');

const PASS = 'correct horse battery';

clearBrowserVerifier();
if (loadBrowserVerifier() !== null) throw new Error('expected empty store');

await rustBridge.unlockVault(PASS);
await rustBridge.lockVault();

const saved = loadBrowserVerifier();
if (!saved) throw new Error('verifier was not persisted after first unlock');
if (saved.iterations !== 600_000) throw new Error(`bad iterations: ${saved.iterations}`);
if (!/^[0-9a-f]{32}$/i.test(saved.salt)) throw new Error('bad salt');
if (!/^[0-9a-f]{64}$/i.test(saved.hash)) throw new Error('bad hash');
if (JSON.stringify(saved).includes(PASS)) throw new Error('passphrase leaked into storage');
console.log('  ✓ first unlock persists verifier (no passphrase in storage)');

// Simulate page reload: wipe memory, keep localStorage.
rustBridge.resetBrowserVaultMemoryForTests();
if (await rustBridge.isVaultUnlocked()) throw new Error('should be locked after reload');
if (!rustBridge.hasVaultConfigured()) throw new Error('hasVaultConfigured should be true after reload');

await rustBridge.unlockVault(PASS);
console.log('  ✓ unlock after simulated reload succeeds with same passphrase');

let wrongFailed = false;
try {
  await rustBridge.lockVault();
  rustBridge.resetBrowserVaultMemoryForTests();
  await rustBridge.unlockVault('wrong passphrase!!');
} catch {
  wrongFailed = true;
}
if (!wrongFailed) throw new Error('wrong passphrase should fail');
console.log('  ✓ wrong passphrase rejected against persisted verifier');

// Corrupt storage must error, not silently replace
saveBrowserVerifier(saved);
store.set('cloudbreak.vault.verifier', '{not json');
let corruptFailed = false;
try {
  loadBrowserVerifier();
} catch {
  corruptFailed = true;
}
if (!corruptFailed) throw new Error('corrupt verifier should throw');
console.log('  ✓ corrupt verifier is an error (not silently replaced)');

clearBrowserVerifier();
console.log('\nBrowser vault persistence checks passed.');
