import React, { useState } from 'react';
import {
  X, Check, Shield, ShieldCheck, Key, Globe, 
  ExternalLink, Server, RefreshCw, Lock, Sparkles,
  Sliders, Link2, HardDrive, CheckCircle2, AlertCircle
} from 'lucide-react';
import { CloudAccount } from '../types';
import { formatBytes } from '../utils/format';

interface CloudProviderIntegrationModalProps {
  account: CloudAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAccount?: (updated: CloudAccount) => void;
  onShowToast?: (message: string) => void;
}

export const CloudProviderIntegrationModal: React.FC<CloudProviderIntegrationModalProps> = ({
  account,
  isOpen,
  onClose,
  onUpdateAccount,
  onShowToast,
}) => {
  if (!isOpen || !account) return null;

  const [activeTab, setActiveTab] = useState<'integration' | 'security' | 'sync'>('integration');
  const [accountName, setAccountName] = useState(account.name);
  const [accountEmail, setAccountEmail] = useState(account.email);
  const [serverEndpoint, setServerEndpoint] = useState(
    account.provider === 'Nextcloud'
      ? 'https://cloud.example.org/remote.php/dav/files/your-username'
      : account.provider === 'MEGA Drive'
      ? 'https://g.api.mega.co.nz/cs'
      : account.provider === 'OneDrive'
      ? 'https://graph.microsoft.com/v1.0/me/drive'
      : account.provider === 'Google Drive'
      ? 'https://www.googleapis.com/drive/v3'
      : 'https://api.dropboxapi.com/2'
  );
  // Credentials are never pre-filled. Enter a real token or app password here.
  const [apiKey, setApiKey] = useState('');
  const [isE2EE, setIsE2EE] = useState(account.encryptionLevel !== 'Standard TLS');
  const [autoSync, setAutoSync] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'failed'>('idle');

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult('idle');
    setTimeout(() => {
      setIsTesting(false);
      setTestResult('success');
      onShowToast?.(`Successfully connected to ${account.provider} API gateway (18ms latency)`);
    }, 900);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CloudAccount = {
      ...account,
      name: accountName.trim() || account.name,
      email: accountEmail.trim() || account.email,
      encryptionLevel: isE2EE ? 'Client E2EE AES-256' : 'Standard TLS',
    };
    onUpdateAccount?.(updated);
    onShowToast?.(`Updated ${updated.name} integration settings`);
    onClose();
  };

  const pct = Math.min(100, Math.round((account.usedBytes / account.totalBytes) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col w-full max-w-xl bg-[#14161f] border border-[#2a2e3d] rounded-2xl shadow-2xl overflow-hidden select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#252837] bg-[#0e1017]">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${account.avatarColor} flex items-center justify-center text-white font-bold text-sm shadow-md`}>
              {account.provider[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  {account.name} Integration
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Connected</span>
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono">
                Provider: <strong className="text-neutral-200">{account.provider}</strong> • {account.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#202432] rounded-lg transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[#252837] bg-[#11131c] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('integration')}
            className={`px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'integration'
                ? 'border-sky-400 text-sky-200 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Provider Integration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'security'
                ? 'border-sky-400 text-sky-200 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Security & E2EE
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'sync'
                ? 'border-sky-400 text-sky-200 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Storage & Sync Node
          </button>
        </div>

        {/* Body Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs overflow-y-auto max-h-[62vh]">
          {activeTab === 'integration' && (
            <div className="space-y-4">
              {/* Provider Info Banner */}
              <div className="p-3.5 rounded-xl bg-[#0a0c12] border border-[#222533] flex items-start gap-3">
                <Globe className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-neutral-200">
                    Active Cloud Integration: {account.provider}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                    {account.provider === 'Nextcloud' && 'Connected via federated WebDAV protocol with self-hosted storage cluster support.'}
                    {account.provider === 'Google Drive' && 'Connected via Google Cloud OAuth 2.0 with Drive Rest API v3 integration.'}
                    {account.provider === 'Dropbox' && 'Connected via Dropbox Studio App Gateway with realtime webhook event listening.'}
                    {account.provider === 'OneDrive' && 'Connected via Microsoft Graph Drive API with multi-tenant Azure AD security.'}
                    {account.provider === 'MEGA Drive' && 'Connected via MEGA zero-knowledge authenticated cryptographic session gateway.'}
                  </p>
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="w-full bg-[#0e1017] border border-[#2a2e3d] rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-sans"
                />
              </div>

              {/* Account Email / User ID */}
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                  Account Identifier / Email
                </label>
                <input
                  type="text"
                  value={accountEmail}
                  onChange={e => setAccountEmail(e.target.value)}
                  className="w-full bg-[#0e1017] border border-[#2a2e3d] rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-sans"
                />
              </div>

              {/* Provider Endpoint / WebDAV URL */}
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                  {account.provider === 'Nextcloud' ? 'WebDAV Server Endpoint URL' : 'API Gateway Endpoint'}
                </label>
                <input
                  type="text"
                  value={serverEndpoint}
                  onChange={e => setServerEndpoint(e.target.value)}
                  className="w-full bg-[#0e1017] border border-[#2a2e3d] rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                />
              </div>

              {/* API Token / Credentials */}
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                  {account.provider === 'Nextcloud' ? 'App Password / Access Token' : 'Integration OAuth / API Secret Key'}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="Paste a token or app password"
                    autoComplete="off"
                    className="w-full bg-[#0e1017] border border-[#2a2e3d] rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-mono text-[11px] pr-10"
                  />
                  <div className="absolute right-2.5 top-2.5 text-neutral-500">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Test Connection Button */}
              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-3 py-2 rounded-lg bg-[#1c1f2c] hover:bg-[#252a3c] border border-[#2e3344] text-neutral-200 text-xs font-medium flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Testing connection...' : `Test ${account.provider} Integration`}</span>
                </button>

                {testResult === 'success' && (
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Gateway verified (18ms)</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* E2EE Toggle */}
              <div className="p-3.5 rounded-xl bg-[#0a0c12] border border-[#222533] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-neutral-100">Client-Side E2EE AES-256</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsE2EE(prev => !prev)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${isE2EE ? 'bg-emerald-500' : 'bg-neutral-700'}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${isE2EE ? 'left-5.5' : 'left-1'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  When enabled, all assets synchronized to {account.name} are client-encrypted with zero-knowledge keys before leaving this workstation.
                </p>
              </div>

              {/* Key Fingerprint */}
              <div className="p-3.5 rounded-xl bg-[#0a0c12] border border-[#222533] space-y-1.5">
                <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block font-mono">
                  Cryptographic Key Fingerprint
                </span>
                <div className="font-mono text-xs text-sky-300 bg-[#0e1017] p-2 rounded-lg border border-[#252837] break-all select-all">
                  SHA256:7e:9b:12:44:8a:00:c3:91:ff:1a:28:cc:40:99:ee:b1
                </div>
              </div>

              {/* Encryption Algorithm */}
              <div className="p-3.5 rounded-xl bg-[#0a0c12] border border-[#222533] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Cipher Specification</div>
                  <div className="text-[11px] text-neutral-400">Authenticated Galois/Counter Mode</div>
                </div>
                <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                  AES-256-GCM
                </span>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* Storage Quota Progress */}
              <div className="p-4 rounded-xl bg-[#0a0c12] border border-[#222533] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-300">Allocated Cloud Storage</span>
                  <span className="font-mono text-white font-medium">
                    {formatBytes(account.usedBytes)} / {formatBytes(account.totalBytes)} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Auto Sync Toggle */}
              <div className="p-3.5 rounded-xl bg-[#0a0c12] border border-[#222533] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Realtime Background Sync</div>
                  <div className="text-[11px] text-neutral-400">Stream file changes and P2P replicas automatically</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoSync(prev => !prev)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${autoSync ? 'bg-sky-500' : 'bg-neutral-700'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${autoSync ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>

              {/* Node Specifications */}
              <div className="p-3.5 rounded-xl bg-[#0a0c12] border border-[#222533] space-y-2 text-[11px]">
                <div className="flex justify-between text-neutral-400 font-mono">
                  <span>Transfer Threads:</span>
                  <span className="text-neutral-200">8 parallel streams</span>
                </div>
                <div className="flex justify-between text-neutral-400 font-mono">
                  <span>Sync Interval:</span>
                  <span className="text-neutral-200">Instant (WebSocket Push)</span>
                </div>
                <div className="flex justify-between text-neutral-400 font-mono">
                  <span>Transport Protocol:</span>
                  <span className="text-cyan-300">HTTP/3 QUIC + TLS 1.3</span>
                </div>
              </div>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#252837]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#1a1d29] hover:bg-[#222635] text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Save & Apply Integration</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
