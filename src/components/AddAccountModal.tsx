import React, { useEffect, useMemo, useState } from 'react';
import { X, Cloud, Loader2, KeyRound, Link2, User } from '@/src/icons';
import { CloudAccount, FileItem, FolderItem } from '../types';
import { PROVIDER_LOGOS } from '../assets/providerLogos';
import {
  accountIdForProvider,
  cloudService,
  CloudProviderKind,
  defaultEndpoint,
} from '../services/cloud';
import {
  credentialsFromGoogleTokens,
  isGoogleOAuthAvailable,
  isGoogleOAuthConfigured,
  signInWithGoogle,
} from '../services/cloud/oauth/google';
import {
  credentialsFromOAuthTokens,
  isOAuthAvailable,
  isOAuthConfigured,
  isPkceProvider,
  oauthEnvName,
  signInWithProvider,
} from '../services/cloud/oauth/pkce';
import { isNextcloudLoginAvailable, signInWithNextcloud } from '../services/cloud/oauth/nextcloud';
import { rcloneStatus, signInWithRclone } from '../services/cloud/rclone';
import { AccessTokenGuide, isTokenProvider } from './cloud/AccessTokenGuide';
import { buildCloudAccount } from '../utils/cloudAccount';
import { isTauri } from '@tauri-apps/api/core';

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

const PROVIDERS: { name: CloudProviderKind; desc: string; auth: 'oauth' | 'webdav' | 'mega' }[] = [
  { name: 'Google Drive', desc: 'Sign in with Google (OAuth)', auth: 'oauth' },
  { name: 'Dropbox', desc: 'Sign in with Dropbox (OAuth)', auth: 'oauth' },
  { name: 'OneDrive', desc: 'Sign in with Microsoft (OAuth)', auth: 'oauth' },
  { name: 'MEGA Drive', desc: 'Email + password (prelogin)', auth: 'mega' },
  { name: 'Nextcloud', desc: 'Browser sign-in (Login Flow v2)', auth: 'webdav' },
];

const OAUTH_COPY: Record<string, { brand: string; button: string; blurb: string; docs: string }> = {
  'Google Drive': {
    brand: 'Google',
    button: 'Sign in with Google',
    blurb: 'Sign in with Google opens your browser, requests Drive access, and stores a refresh token in the OS keychain so Cloudbreak can keep the connection alive.',
    docs: 'docs/google-drive-oauth.md',
  },
  Dropbox: {
    brand: 'Dropbox',
    button: 'Sign in with Dropbox',
    blurb: 'Sign in with Dropbox opens your browser, asks you to approve file access, and stores a refresh token in the OS keychain so the connection stays alive.',
    docs: 'docs/cloud-oauth.md',
  },
  OneDrive: {
    brand: 'Microsoft',
    button: 'Sign in with Microsoft',
    blurb: 'Sign in with Microsoft opens your browser, asks you to approve OneDrive access, and stores a refresh token in the OS keychain so the connection stays alive.',
    docs: 'docs/cloud-oauth.md',
  },
};

function oauthReady(provider: CloudProviderKind): boolean {
  if (provider === 'Google Drive') return isGoogleOAuthAvailable();
  return isPkceProvider(provider) && isOAuthAvailable(provider);
}

function oauthConfigured(provider: CloudProviderKind): boolean {
  if (provider === 'Google Drive') return isGoogleOAuthConfigured();
  return isPkceProvider(provider) && isOAuthConfigured(provider);
}

function oauthEnv(provider: CloudProviderKind): string {
  return isPkceProvider(provider) ? oauthEnvName(provider) : 'VITE_GOOGLE_OAUTH_CLIENT_ID';
}

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
  const [showAdvancedToken, setShowAdvancedToken] = useState(false);
  const [nextcloudServer, setNextcloudServer] = useState('');
  const [rcloneReady, setRcloneReady] = useState(false);

  const meta = useMemo(() => PROVIDERS.find(p => p.name === provider)!, [provider]);
  const oauthOk = oauthReady(provider);
  const copy = OAUTH_COPY[provider];
  const nextcloudSignIn = meta.auth === 'webdav' && !showAdvancedToken;

  useEffect(() => {
    if (!isOpen || provider !== 'Google Drive') return;
    let cancelled = false;
    void rcloneStatus()
      .then(s => { if (!cancelled) setRcloneReady(s.available); })
      .catch(() => { if (!cancelled) setRcloneReady(false); });
    return () => { cancelled = true; };
  }, [isOpen, provider]);

  if (!isOpen) return null;

  const selectProvider = (name: CloudProviderKind) => {
    setProvider(name);
    setEndpoint(defaultEndpoint(name));
    setError(null);
    setShowAdvancedToken(false);
  };

  const finishConnect = async (input: Parameters<typeof cloudService.connectAndSync>[0]) => {
    const { accountId, info, library, note } = await cloudService.connectAndSync(input);
    void accountId;
    const account = buildCloudAccount(provider, info, endpoint.trim() || defaultEndpoint(provider));
    onAddAccount({ account, folders: library.folders, files: library.files, note });
    setAccessToken('');
    setPassword('');
    onClose();
  };

  const handleOAuthSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const target = endpoint.trim() || defaultEndpoint(provider);
      if (provider === 'Google Drive') {
        const tokens = await signInWithGoogle();
        await finishConnect({ provider, ...credentialsFromGoogleTokens(tokens, target) });
      } else if (isPkceProvider(provider)) {
        const tokens = await signInWithProvider(provider);
        await finishConnect({ provider, ...credentialsFromOAuthTokens(tokens, target) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRcloneSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const rcloneToken = await signInWithRclone();
      await finishConnect({ provider: 'Google Drive', rcloneToken, endpoint: defaultEndpoint('Google Drive') });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleNextcloudSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const login = await signInWithNextcloud(nextcloudServer);
      setEndpoint(login.endpoint);
      await finishConnect({
        provider: 'Nextcloud',
        username: login.username,
        password: login.appPassword,
        endpoint: login.endpoint,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (meta.auth === 'oauth' && !showAdvancedToken) {
      await handleOAuthSignIn();
      return;
    }
    if (nextcloudSignIn) {
      await handleNextcloudSignIn();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await finishConnect({
        provider,
        accessToken: accessToken.trim() || undefined,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
        endpoint: endpoint.trim() || defaultEndpoint(provider),
      });
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

          {meta.auth === 'oauth' && !showAdvancedToken && copy && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 space-y-2">
                <div className="text-xs font-semibold text-emerald-400">Official {provider} sign-in</div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">{copy.blurb}</p>
                {!isTauri() && (
                  <p className="text-[11px] text-amber-200/90">
                    {copy.button} needs the desktop app. Use advanced token paste below in the browser preview, or open Cloudbreak Files on your computer.
                  </p>
                )}
                {isTauri() && !oauthConfigured(provider) && (
                  <p className="text-[11px] text-amber-200/90">
                    Set <span className="font-mono">{oauthEnv(provider)}</span> to your {provider} OAuth client ID.
                    See <span className="font-mono">{copy.docs}</span>.
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={busy || !oauthOk}
                onClick={() => void handleOAuthSignIn()}
                className="w-full px-4 py-2.5 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <img src={PROVIDER_LOGOS[provider]} alt="" className="w-5 h-5 object-contain" />
                )}
                {busy ? `Waiting for ${copy.brand}…` : copy.button}
              </button>
              {provider === 'Google Drive' && (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={busy || !rcloneReady}
                    onClick={() => void handleRcloneSignIn()}
                    className={`w-full px-4 py-2.5 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${
                      oauthOk
                        ? 'bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100'
                        : 'bg-white hover:bg-neutral-100 text-neutral-900'
                    }`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <img src={PROVIDER_LOGOS['Google Drive']} alt="" className="w-5 h-5 object-contain" />
                    )}
                    Quick sign-in (no setup)
                  </button>
                  <p className="text-[10px] text-neutral-500 leading-relaxed">
                    {rcloneReady
                      ? 'Uses the bundled rclone and its shared Google app, so you don’t need your own client ID. Google’s consent screen will say “rclone”, and shared apps can be rate-limited.'
                      : isTauri()
                        ? 'rclone was not found. Install it with Homebrew (brew install rclone) or use a release build, which bundles it.'
                        : 'Quick sign-in needs the desktop app.'}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowAdvancedToken(true)}
                className="text-[11px] text-neutral-500 hover:text-neutral-300 underline-offset-2 hover:underline"
              >
                Advanced: paste an access token instead
              </button>
            </div>
          )}

          {nextcloudSignIn && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 space-y-2">
                <div className="text-xs font-semibold text-emerald-400">Official Nextcloud sign-in</div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Enter your server address. Nextcloud asks you to approve Cloudbreak in the browser and
                  hands back a revocable app password. Your account password is never seen or stored.
                </p>
                {!isNextcloudLoginAvailable() && (
                  <p className="text-[11px] text-amber-200/90">
                    Browser sign-in needs the desktop app. Use the app-password option below in the browser preview.
                  </p>
                )}
              </div>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" /> Server address
                </span>
                <input
                  value={nextcloudServer}
                  onChange={e => setNextcloudServer(e.target.value)}
                  required
                  placeholder="https://cloud.example.org"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500/50"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !isNextcloudLoginAvailable() || !nextcloudServer.trim()}
                className="w-full px-4 py-2.5 rounded-lg bg-white hover:bg-neutral-100 text-neutral-900 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <img src={PROVIDER_LOGOS.Nextcloud} alt="" className="w-5 h-5 object-contain" />
                )}
                {busy ? 'Waiting for Nextcloud…' : 'Sign in with Nextcloud'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdvancedToken(true)}
                className="text-[11px] text-neutral-500 hover:text-neutral-300 underline-offset-2 hover:underline"
              >
                Advanced: enter an app password instead
              </button>
            </div>
          )}

          {meta.auth === 'oauth' && showAdvancedToken && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setShowAdvancedToken(false)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300"
              >
                ← Back to {copy?.button ?? 'sign-in'}
              </button>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Access token
                </span>
                <textarea
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  required
                  rows={3}
                  placeholder="Paste a bearer access token with Drive scope"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500/50"
                />
              </label>
              {isTokenProvider(provider) && <AccessTokenGuide provider={provider} />}
            </div>
          )}

          {((meta.auth === 'webdav' && showAdvancedToken) || meta.auth === 'mega') && (
            <>
              {meta.auth === 'webdav' && (
                <button
                  type="button"
                  onClick={() => setShowAdvancedToken(false)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  ← Back to Sign in with Nextcloud
                </button>
              )}
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

          {!nextcloudSignIn && (
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
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-200 text-[11px]">
              {error}
            </div>
          )}

          {(meta.auth === 'mega' || showAdvancedToken) && (
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
          )}

          {meta.auth !== 'mega' && !showAdvancedToken && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
