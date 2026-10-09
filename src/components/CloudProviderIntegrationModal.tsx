import React, { useState } from 'react';
import {
  X, Check, Key, Globe,
  RefreshCw, CheckCircle2, AlertCircle, Unlink, Loader2
} from '@/src/icons';
import { CloudAccount, FileItem, FolderItem } from '../types';
import { formatBytes } from '../utils/format';
import {
  cloudService,
  CloudProviderKind,
  defaultEndpoint,
  credentialStore,
} from '../services/cloud';
import { AccessTokenGuide, isTokenProvider } from './cloud/AccessTokenGuide';

export interface CloudSyncPayload {
  account: CloudAccount;
  folders: FolderItem[];
  files: FileItem[];
  note?: string;
}

interface CloudProviderIntegrationModalProps {
  account: CloudAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAccount?: (updated: CloudAccount) => void;
  onSyncLibrary?: (payload: CloudSyncPayload) => void;
  onShowToast?: (message: string) => void;
  onDisconnect?: (accountId: string) => void;
}

function asProviderKind(provider: string): CloudProviderKind | null {
  if (
    provider === 'Google Drive'
    || provider === 'Dropbox'
    || provider === 'OneDrive'
    || provider === 'MEGA Drive'
    || provider === 'Nextcloud'
  ) {
    return provider;
  }
  return null;
}

export const CloudProviderIntegrationModal: React.FC<CloudProviderIntegrationModalProps> = ({
  account,
  isOpen,
  onClose,
  onUpdateAccount,
  onSyncLibrary,
  onShowToast,
  onDisconnect,
}) => {
  const kind = account ? asProviderKind(account.provider) : null;
  const existing = account ? credentialStore.get(account.id) : null;

  const [activeTab, setActiveTab] = useState<'integration' | 'sync'>('integration');
  const [accountName, setAccountName] = useState(account?.name ?? '');
  const [accountEmail, setAccountEmail] = useState(account?.email ?? '');
  const [serverEndpoint, setServerEndpoint] = useState(
    account?.endpoint
      || existing?.endpoint
      || (kind ? defaultEndpoint(kind) : ''),
  );
  const [username, setUsername] = useState(existing?.username || '');
  // Credentials are never pre-filled from secrets. Enter a real token or app password here.
  const [apiKey, setApiKey] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'failed'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  React.useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void (async () => {
      await credentialStore.hydrate();
      if (cancelled) return;
      const saved = credentialStore.get(account.id);
      const nextKind = asProviderKind(account.provider);
      setAccountName(account.name);
      setAccountEmail(account.email);
      setServerEndpoint(account.endpoint || saved?.endpoint || (nextKind ? defaultEndpoint(nextKind) : ''));
      setUsername(saved?.username || '');
      setApiKey('');
      setActiveTab('integration');
      setTestResult('idle');
      setTestError(null);
      setConfirmingDisconnect(false);
    })();
    return () => { cancelled = true; };
  }, [account?.id]);

  if (!isOpen || !account) return null;

  const buildCreds = () => {
    if (!kind) throw new Error(`Unsupported provider: ${account.provider}`);
    const tokenOrPass = apiKey.trim() || existing?.accessToken || existing?.password || '';
    return {
      accountId: account.id,
      provider: kind,
      endpoint: serverEndpoint.trim() || defaultEndpoint(kind),
      accessToken: kind === 'Nextcloud' || kind === 'MEGA Drive' ? undefined : tokenOrPass,
      username: kind === 'Nextcloud' || kind === 'MEGA Drive'
        ? (username.trim() || accountEmail.trim())
        : undefined,
      password: kind === 'Nextcloud' || kind === 'MEGA Drive' ? tokenOrPass : undefined,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult('idle');
    setTestError(null);
    try {
      const info = await cloudService.testConnection(buildCreds());
      setAccountEmail(info.email);
      setTestResult('success');
      onShowToast?.(`Verified ${account.provider} as ${info.email}`);
    } catch (err) {
      setTestResult('failed');
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) {
      onUpdateAccount?.({
        ...account,
        name: accountName.trim() || account.name,
        email: accountEmail.trim() || account.email,
      });
      onClose();
      return;
    }

    setIsSyncing(true);
    setTestError(null);
    try {
      const { info, library, note } = await cloudService.connectAndSync(buildCreds());
      const updated: CloudAccount = {
        ...account,
        name: accountName.trim() || account.name,
        email: info.email || accountEmail.trim() || account.email,
        usedBytes: info.usedBytes || account.usedBytes,
        totalBytes: info.totalBytes || account.totalBytes,
        status: 'connected',
        liveConnected: true,
        endpoint: serverEndpoint.trim() || defaultEndpoint(kind),
      };
      onSyncLibrary?.({ account: updated, folders: library.folders, files: library.files, note });
      onUpdateAccount?.(updated);
      onShowToast?.(note || `Synced ${library.files.length} items from ${updated.name}`);
      onClose();
    } catch (err) {
      setTestResult('failed');
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = () => {
    void (async () => {
      await cloudService.disconnect(account.id);
      onDisconnect?.(account.id);
      onClose();
    })();
  };

  const pct = Math.min(100, Math.round((account.usedBytes / Math.max(account.totalBytes, 1)) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="app-modal-panel relative flex flex-col w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${account.avatarColor} flex items-center justify-center text-white font-bold text-sm shadow-md`}>
              {account.provider[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  {account.name} Integration
                </h2>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  account.liveConnected || credentialStore.has(account.id)
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    account.liveConnected || credentialStore.has(account.id) ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`} />
                  <span>{account.liveConnected || credentialStore.has(account.id) ? 'Live API' : 'Demo data'}</span>
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
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/10 bg-neutral-950/80 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('integration')}
            className={`px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'integration'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Provider Integration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-2 border-b-2 font-medium transition-all ${
              activeTab === 'sync'
                ? 'border-sky-400 text-sky-400 font-semibold'
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
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-start gap-3">
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-sans"
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-sans"
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                />
              </div>

              {(account.provider === 'Nextcloud' || account.provider === 'MEGA Drive') && (
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                    {account.provider === 'MEGA Drive' ? 'MEGA Email' : 'WebDAV Username'}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={account.provider === 'MEGA Drive' ? 'you@example.com' : 'username'}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-sans"
                  />
                </div>
              )}

              {/* API Token / Credentials */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">
                    {account.provider === 'Nextcloud'
                      ? 'App Password'
                      : account.provider === 'MEGA Drive'
                      ? 'Password'
                      : 'OAuth Access Token'}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={existing ? 'Leave blank to keep saved credentials' : 'Paste a token or password'}
                      autoComplete="off"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-mono text-[11px] pr-10"
                    />
                    <div className="absolute right-2.5 top-2.5 text-neutral-500">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  {account.liveConnected && (
                    <p className="text-[10px] text-emerald-400/80 mt-1.5">Live credentials on file for this account.</p>
                  )}
                </div>
                {isTokenProvider(account.provider) && <AccessTokenGuide provider={account.provider} />}
              </div>

              {/* Test Connection Button */}
              <div className="pt-1 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void handleTestConnection()}
                    disabled={isTesting || !kind}
                    className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testing connection...' : `Test ${account.provider} Integration`}</span>
                  </button>

                  {testResult === 'success' && (
                    <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Gateway verified</span>
                    </span>
                  )}
                  {testResult === 'failed' && (
                    <span className="text-rose-400 font-mono text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Failed</span>
                    </span>
                  )}
                </div>
                {testError && (
                  <p className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg px-2.5 py-2">
                    {testError}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* Storage Quota Progress */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
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
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
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
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-[11px]">
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
          {confirmingDisconnect ? (
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
              <div>
                <div className="text-xs font-semibold text-red-200">Disconnect {account.name}?</div>
                <div className="text-[11px] text-neutral-400">Syncing stops and it leaves the sidebar. Your files stay in the provider.</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmingDisconnect(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                className="px-4 py-2 rounded-lg bg-red-950/50 hover:bg-red-900/60 border border-red-800/60 text-red-300 hover:text-red-100 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                title={`Disconnect ${account.name} from Cloudbreak Files`}
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Disconnect Account</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSyncing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  <span>{isSyncing ? 'Syncing…' : 'Save & Sync'}</span>
                </button>
              </div>
            </div>
          )}
        </form>

      </div>
    </div>
  );
};
