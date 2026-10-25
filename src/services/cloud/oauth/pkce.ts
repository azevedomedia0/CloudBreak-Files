/**
 * Official Dropbox and OneDrive (Microsoft identity platform) sign-in.
 * OAuth 2.0 code + PKCE with a loopback redirect, handled in Rust (`oauth_pkce.rs`).
 * Needs VITE_DROPBOX_OAUTH_CLIENT_ID / VITE_MICROSOFT_OAUTH_CLIENT_ID — see docs/cloud-oauth.md.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { credentialStore } from '../credentials';
import { CloudProviderKind, ProviderCredentials } from '../types';

export type PkceProviderKind = Extract<CloudProviderKind, 'Dropbox' | 'OneDrive'>;

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

const RUST_ID: Record<PkceProviderKind, 'dropbox' | 'onedrive'> = {
  Dropbox: 'dropbox',
  OneDrive: 'onedrive',
};

const ENV_NAME: Record<PkceProviderKind, string> = {
  Dropbox: 'VITE_DROPBOX_OAUTH_CLIENT_ID',
  OneDrive: 'VITE_MICROSOFT_OAUTH_CLIENT_ID',
};

export function isPkceProvider(provider: string): provider is PkceProviderKind {
  return provider === 'Dropbox' || provider === 'OneDrive';
}

export function oauthEnvName(provider: PkceProviderKind): string {
  return ENV_NAME[provider];
}

/** Public OAuth client ID. Safe to ship; not a secret with PKCE. */
export function oauthClientId(provider: PkceProviderKind): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env[ENV_NAME[provider]] || '').trim();
}

export function isOAuthConfigured(provider: PkceProviderKind): boolean {
  return oauthClientId(provider).length > 0;
}

export function isOAuthAvailable(provider: PkceProviderKind): boolean {
  return isTauri() && isOAuthConfigured(provider);
}

function expiresAtFromSeconds(expiresIn?: number): string | undefined {
  if (!expiresIn || expiresIn <= 0) return undefined;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/** Open the system browser and complete sign-in. Desktop only. */
export async function signInWithProvider(provider: PkceProviderKind): Promise<OAuthTokens> {
  if (!isTauri()) {
    throw new Error(`Sign in with ${provider} requires the Cloudbreak desktop app.`);
  }
  const clientId = oauthClientId(provider);
  if (!clientId) {
    throw new Error(`${provider} OAuth client ID is not configured. Set ${ENV_NAME[provider]} (see docs/cloud-oauth.md).`);
  }
  return invoke<OAuthTokens>('oauth_sign_in', { provider: RUST_ID[provider], clientId });
}

export function credentialsFromOAuthTokens(
  tokens: OAuthTokens,
  endpoint?: string,
): Pick<ProviderCredentials, 'accessToken' | 'refreshToken' | 'expiresAt' | 'endpoint'> {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: expiresAtFromSeconds(tokens.expiresIn),
    endpoint,
  };
}

/**
 * Ensure Dropbox / OneDrive credentials have a non-expired access token.
 * Refreshes and persists when needed. Pasted tokens without a refresh token are used as-is.
 */
export async function ensureOAuthAccessToken(creds: ProviderCredentials): Promise<ProviderCredentials> {
  if (!isPkceProvider(creds.provider)) return creds;
  const provider = creds.provider;

  const token = creds.accessToken?.trim();
  const refresh = creds.refreshToken?.trim();
  if (!token && !refresh) throw new Error(`${provider} is not signed in`);

  const expiresAt = creds.expiresAt ? Date.parse(creds.expiresAt) : NaN;
  const stillValid = Boolean(token) && (!Number.isFinite(expiresAt) || expiresAt - 60_000 > Date.now());
  if (stillValid) return creds;

  if (!refresh) {
    if (token) return creds; // pasted token — use until the API rejects it
    throw new Error(`${provider} access expired. Sign in again.`);
  }
  if (!isTauri() || !isOAuthConfigured(provider)) {
    throw new Error(
      `${provider} access expired and the OAuth client ID is missing — cannot refresh. Set ${ENV_NAME[provider]} and sign in again.`,
    );
  }

  const next = await invoke<OAuthTokens>('oauth_refresh', {
    provider: RUST_ID[provider],
    clientId: oauthClientId(provider),
    refreshToken: refresh,
  });
  const updated: ProviderCredentials = {
    ...creds,
    accessToken: next.accessToken,
    refreshToken: next.refreshToken || refresh,
    expiresAt: expiresAtFromSeconds(next.expiresIn) ?? creds.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  await credentialStore.save(updated);
  return updated;
}
