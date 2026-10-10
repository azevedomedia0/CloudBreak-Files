import React, { useState } from 'react';
import {
  X, Shield, ShieldCheck, Key, Lock, Unlock, RefreshCw, 
  Check, Copy, AlertTriangle, FileCode, Cpu, Fingerprint
} from '@/src/icons';

interface VaultSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  isVaultUnlocked: boolean;
  onToggleVaultLock: (unlocked: boolean, passphrase?: string) => void | Promise<void>;
}

export const VaultSecurityModal: React.FC<VaultSecurityModalProps> = ({
  isOpen,
  onClose,
  isVaultUnlocked,
  onToggleVaultLock,
}) => {
  const [passphrase, setPassphrase] = useState<string>('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="app-modal-panel relative flex flex-col w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isVaultUnlocked ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-100">
                  Encrypted Vault
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                  isVaultUnlocked 
                    ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800' 
                    : 'bg-amber-950/40 text-amber-300 border-amber-800'
                }`}>
                  {isVaultUnlocked ? 'VAULT UNLOCKED' : 'VAULT LOCKED'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Client-side AES-256-GCM · key derived from your passphrase
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          
          {/* Vault Lock / Unlock Card */}
          <div className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isVaultUnlocked ? <Unlock className="w-4 h-4 text-cyan-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
                <span className="text-xs font-semibold text-neutral-200">
                  {isVaultUnlocked ? 'Client Decryption Session Active' : 'Vault Locked & Encrypted'}
                </span>
              </div>
              <button
                onClick={async () => {
                  await onToggleVaultLock(!isVaultUnlocked, passphrase);
                  setPassphrase('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isVaultUnlocked
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-cyan-400 text-neutral-950 font-semibold hover:bg-cyan-300'
                }`}
              >
                {isVaultUnlocked ? 'Lock Vault Now' : 'Unlock with Passphrase'}
              </button>
            </div>
            
            <p className="text-xs text-neutral-400">
              When locked, files encrypted with the vault need your passphrase to open. The first unlock sets the passphrase (8 or more characters); later unlocks — including after a page reload — must match it. Keep it safe. It cannot be recovered, and if you lose it the encrypted files cannot be opened.
            </p>

            {!isVaultUnlocked && (
              <div className="pt-2">
                <input
                  type="password"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  placeholder="Enter vault passphrase (8+ characters)"
                  autoComplete="off"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
          </div>

          {/* Cryptographic Specifications */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Cryptographic Parameters
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg">
                <div className="text-neutral-500 text-[10px]">Cipher Engine</div>
                <div className="text-neutral-200 font-medium mt-1 font-mono">AES-GCM (256-bit)</div>
              </div>
              <div className="p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg">
                <div className="text-neutral-500 text-[10px]">Key Derivation</div>
                <div className="text-neutral-200 font-medium mt-1 font-mono">PBKDF2 (600,000 iterations)</div>
              </div>
              <div className="p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg">
                <div className="text-neutral-500 text-[10px]">Passphrase Check</div>
                <div className="text-neutral-200 font-medium mt-1 font-mono">Salted verifier, constant-time compare</div>
              </div>
              <div className="p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg">
                <div className="text-neutral-500 text-[10px]">Initialization Vector</div>
                <div className="text-neutral-200 font-medium mt-1 font-mono">96-bit random nonce per file</div>
              </div>
            </div>
          </div>


        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-neutral-800 bg-neutral-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
