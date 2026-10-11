import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Lock, Unlock, Eye, EyeOff } from '@/src/icons';
import { rustBridge } from '../services/rustBridge';

interface VaultSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  isVaultUnlocked: boolean;
  onToggleVaultLock: (unlocked: boolean, passphrase?: string) => void | boolean | Promise<boolean | void>;
}

const MIN_LENGTH = 8;

const fieldClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-3 pr-10 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500';

export const VaultSecurityModal: React.FC<VaultSecurityModalProps> = ({
  isOpen,
  onClose,
  isVaultUnlocked,
  onToggleVaultLock,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPassphrase('');
    setConfirm('');
    setReveal(false);
    setFailed(false);
    void rustBridge.isVaultConfigured().then(value => {
      if (!cancelled) setConfigured(value);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const creating = configured === false;
  const longEnough = passphrase.length >= MIN_LENGTH;
  const matches = passphrase === confirm;
  const canSubmit = !busy && configured !== null && longEnough && (!creating || (confirm.length > 0 && matches));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setFailed(false);
    const result = await onToggleVaultLock(true, passphrase);
    setBusy(false);
    if (result === false) {
      setFailed(true);
      return;
    }
    setPassphrase('');
    setConfirm('');
    onClose();
  };

  const lock = async () => {
    await onToggleVaultLock(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="app-modal-panel relative flex flex-col w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">

        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isVaultUnlocked ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">Encrypted Vault</h2>
              <p className="text-xs text-neutral-400 mt-0.5">{isVaultUnlocked ? 'Unlocked' : 'Locked'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isVaultUnlocked ? (
            <>
              <div className="flex items-start gap-3">
                <Unlock className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" />
                <p className="text-sm text-neutral-300">
                  The vault is unlocked. Files you encrypt now are readable until you lock it or it locks itself after being idle.
                </p>
              </div>
              <button
                onClick={() => void lock()}
                className="w-full px-4 py-2.5 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 text-sm font-semibold transition-colors"
              >
                Lock vault
              </button>
            </>
          ) : (
            <form onSubmit={e => void submit(e)} className="space-y-4">
              <div className="flex items-start gap-3">
                <Lock className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">
                    {creating ? 'Create a vault passphrase' : 'Enter your passphrase'}
                  </h3>
                  {creating && (
                    <p className="text-xs text-neutral-400 mt-1">
                      At least {MIN_LENGTH} characters. It can’t be recovered, so save it somewhere safe. If you lose it, encrypted files can’t be opened.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={reveal ? 'text' : 'password'}
                    value={passphrase}
                    onChange={e => { setPassphrase(e.target.value); setFailed(false); }}
                    placeholder="Passphrase"
                    aria-label="Passphrase"
                    autoComplete={creating ? 'new-password' : 'current-password'}
                    autoFocus
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal(r => !r)}
                    aria-label={reveal ? 'Hide passphrase' : 'Show passphrase'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-200"
                  >
                    {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {creating && (
                  <input
                    type={reveal ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Confirm passphrase"
                    aria-label="Confirm passphrase"
                    autoComplete="new-password"
                    className={fieldClass}
                  />
                )}
              </div>

              <div className="min-h-4 text-[11px]" aria-live="polite">
                {failed ? (
                  <span className="text-rose-300">
                    {creating ? 'Couldn’t create the vault. Try again.' : 'That passphrase didn’t work. Check it and try again.'}
                  </span>
                ) : passphrase.length > 0 && !longEnough ? (
                  <span className="text-neutral-400">{MIN_LENGTH - passphrase.length} more character{MIN_LENGTH - passphrase.length === 1 ? '' : 's'} needed</span>
                ) : creating && confirm.length > 0 && !matches ? (
                  <span className="text-amber-300">Passphrases don’t match</span>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full px-4 py-2.5 rounded-lg bg-cyan-400 text-neutral-950 text-sm font-semibold hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? 'Working…' : creating ? 'Create vault' : 'Unlock'}
              </button>
            </form>
          )}

          <details className="group text-xs text-neutral-400">
            <summary className="cursor-pointer select-none hover:text-neutral-200">Encryption details</summary>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-neutral-300">
              <li>Cipher: AES-256-GCM, new random nonce per file</li>
              <li>Key: PBKDF2, 600,000 iterations, derived on this device</li>
              <li>Stored: a salted passphrase check, never the passphrase</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
};
