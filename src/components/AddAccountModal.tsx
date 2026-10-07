import React, { useState } from 'react';
import { X, Cloud, HardDrive, Shield, Check, Server, Lock } from 'lucide-react';
import { CloudAccount } from '../types';

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
  const [accountName, setAccountName] = useState('');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [encryptionOption, setEncryptionOption] = useState<'Standard TLS' | 'Client E2EE AES-256'>('Client E2EE AES-256');
  const [storageLimitGB, setStorageLimitGB] = useState(500);

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
      name: accountName.trim() || `${provider} Account`,
      provider,
      email: accountIdentifier.trim() || `user@${provider.toLowerCase().replace(/\s+/g, '')}.com`,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      usedBytes: 1.2 * 1024 * 1024 * 1024,
      totalBytes: storageLimitGB * 1024 * 1024 * 1024,
      status: 'connected',
      encryptionLevel: encryptionOption === 'Client E2EE AES-256' ? 'Client E2EE AES-256' : 'Standard TLS',
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
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    provider === p.name
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <div className="font-semibold text-neutral-200">{p.name}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Account Label */}
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5">
              Account Label / Display Name
            </label>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              placeholder="e.g. Master Production S3 or Work Drive"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Bucket or Email */}
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5">
              Account Email / Identifier
            </label>
            <input
              type="text"
              value={accountIdentifier}
              onChange={e => setAccountIdentifier(e.target.value)}
              placeholder={provider === 'Nextcloud' ? 'https://cloud.example.org or user@nextcloud' : provider === 'OneDrive' ? 'user@onedrive.live.com' : provider === 'MEGA Drive' ? 'user@mega.nz' : 'account@company.com'}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Encryption Policy */}
          <div className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Client-Side E2EE Encryption Policy</span>
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              When enabled, assets stored in this account will be encrypted client-side using AES-GCM-256 before transfer.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEncryptionOption('Client E2EE AES-256')}
                className={`flex-1 py-1.5 px-2 rounded border text-center transition-colors ${
                  encryptionOption === 'Client E2EE AES-256'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-medium'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                AES-256 E2EE (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setEncryptionOption('Standard TLS')}
                className={`flex-1 py-1.5 px-2 rounded border text-center transition-colors ${
                  encryptionOption === 'Standard TLS'
                    ? 'bg-neutral-800 border-neutral-600 text-neutral-200 font-medium'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                Standard TLS Only
              </button>
            </div>
          </div>

          {/* Storage Quota */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-neutral-300">Allocated Quota</span>
              <span className="font-mono text-cyan-400">{storageLimitGB} GB</span>
            </div>
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={storageLimitGB}
              onChange={e => setStorageLimitGB(parseInt(e.target.value, 10))}
              className="w-full custom-range"
            />
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
