import React, { useMemo, useState } from 'react';
import { X, Cloud, Loader2, KeyRound, Link2, User } from 'lucide-react';
import { CloudAccount, FileItem, FolderItem } from '../types';
import { PROVIDER_LOGOS } from '../assets/providerLogos';
import {
  accountIdForProvider,
  cloudService,
  CloudProviderKind,
  defaultEndpoint,
} from '../services/cloud';
import { AccessTokenGuide, isTokenProvider } from './cloud/AccessTokenGuide';
import { buildCloudAccount } from '../utils/cloudAccount';

export interface MountedCloudResult {
  account: CloudAccount;
  folders: FolderItem[];
  files: FileItem[];
  note?: string;
}

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAccount: (result: MountedCloudResult) => void;
}

const PROVIDERS: { name: CloudProviderKind; desc: string; auth: 'token' | 'webdav' | 'mega' }[] = [
  { name: 'Google Drive', desc: 'OAuth access token (Drive scope)', auth: 'token' },
  { name: 'Dropbox', desc: 'OAuth access token', auth: 'token' },
  { name: 'OneDrive', desc: 'Microsoft Graph access token', auth: 'token' },
  { name: 'MEGA Drive', desc: 'Email + password (prelogin)', auth: 'mega' },
  { name: 'Nextcloud', desc: 'WebDAV URL + app password', auth: 'webdav' },
];

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAddAccount,
}) => {
  const [provider, setProvider] = useState<CloudProviderKind>('Google Drive');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [endpoint, setEndpoint] = useState(defaultEndpoint('Google Drive'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = useMemo(() => PROVIDERS.find(p => p.name === provider)!, [provider]);

  if (!isOpen) return null;

  const selectProvider = (name: CloudProviderKind) => {
    setProvider(name);
    setEndpoint(defaultEndpoint(name));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accountId, info, library, note } = await cloudService.connectAndSync({
        provider,
        accessToken: accessToken.trim() || undefined,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
        endpoint: endpoint.trim() || defaultEndpoint(provider),
      });

      const account = buildCloudAccount(provider, info, endpoint.trim());

      onAddAccount({ account, folders: library.folders, files: library.files, note });
      setAccessToken('');
      setPassword('');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes('Failed to fetch') || message.includes('CORS')
          ? `${message} — run the desktop app (Tauri) so API calls bypass browser CORS.`
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="app-modal-panel relative flex flex-col w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Connect Cloud Storage Provider
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Live API mount into your unified Cloudbreak browser
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs overflow-y-auto">
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Cloud Service
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => selectProvider(p.name)}
                  className={`p-3 rounded-lg border text-left transition-colors flex items-center gap-2.5 ${
                    provider === p.name
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <img src={PROVIDER_LOGOS[p.name]} alt="" className="w-7 h-7 shrink-0 object-contain" />
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-200">{p.name}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5 truncate">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {(meta.auth === 'token') && (
            <div className="space-y-2.5">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Access token
                </span>
                <textarea
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  required
                  rows={3}
                  placeholder="Paste a bearer access token with files.read scope"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500/50"
                />
              </label>
              {isTokenProvider(provider) && <AccessTokenGuide provider={provider} />}
            </div>
          )}

          {(meta.auth === 'webdav' || meta.auth === 'mega') && (
            <>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {meta.auth === 'mega' ? 'Email' : 'Username'}
                </span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 focus:outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  {meta.auth === 'mega' ? 'Password' : 'App password'}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 focus:outline-none focus:border-cyan-500/50"
                />
              </label>
            </>
          )}

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Endpoint
            </span>
            <input
              value={endpoint}
              onChange={e => setEndpoint(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500/50"
            />
            {meta.auth === 'webdav' && (
              <p className="text-[10px] text-neutral-500">
                Example: https://cloud.example.org/remote.php/dav/files/your-username
              </p>
            )}
            <p className="text-[10px] text-neutral-500">
              Mounts into account slot <span className="font-mono text-neutral-400">{accountIdForProvider(provider)}</span>
            </p>
          </label>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-200 text-[11px]">
              {error}
            </div>
          )}

          <div className="pt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-bold disabled:opacity-60 flex items-center gap-2"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy ? 'Connecting…' : 'Mount Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
