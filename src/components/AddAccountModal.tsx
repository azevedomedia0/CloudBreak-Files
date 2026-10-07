import React, { useState } from 'react';
import { X, Cloud } from 'lucide-react';
import { CloudAccount } from '../types';
import { PROVIDER_LOGOS } from '../assets/providerLogos';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAccount: (account: CloudAccount) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAddAccount,
}) => {
  const [provider, setProvider] = useState<'Google Drive' | 'Dropbox' | 'OneDrive' | 'MEGA Drive' | 'Nextcloud' | 'Encrypted Vault'>('Google Drive');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `acc-${Date.now()}` as any;
    const colors = [
      'from-emerald-500 to-teal-600',
      'from-purple-600 to-indigo-600',
      'from-rose-500 to-orange-500',
      'from-cyan-500 to-blue-600',
    ];

    const newAccount: CloudAccount = {
      id,
      name: `${provider} Account`,
      provider,
      email: `user@${provider.toLowerCase().replace(/\s+/g, '')}.com`,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      usedBytes: 1.2 * 1024 * 1024 * 1024,
      totalBytes: 500 * 1024 * 1024 * 1024,
      status: 'connected',
      encryptionLevel: 'Client E2EE AES-256',
      isVault: provider === 'Encrypted Vault',
    };

    onAddAccount(newAccount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative flex flex-col w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Connect Cloud Storage Provider
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Mount cloud buckets into your unified AetherCloud browser
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {/* Provider Selection */}
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Cloud Service
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Google Drive', desc: 'Workspace or Personal' },
                { name: 'Dropbox', desc: 'Studio & Team folders' },
                { name: 'OneDrive', desc: 'Microsoft 365 & Personal' },
                { name: 'MEGA Drive', desc: 'Zero-Knowledge Encrypted' },
                { name: 'Nextcloud', desc: 'Self-Hosted WebDAV & E2EE' },
              ].map(p => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => setProvider(p.name as any)}
                  className={`p-3 rounded-lg border text-left transition-colors flex items-center gap-2.5 ${
                    provider === p.name
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <img src={PROVIDER_LOGOS[p.name]} alt="" className="w-7 h-7 shrink-0 object-contain" />
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-200">{p.name}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-bold"
            >
              Mount Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
