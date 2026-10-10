/**
 * Official Google Drive OAuth (desktop PKCE + loopback).
 * Requires VITE_GOOGLE_OAUTH_CLIENT_ID — see docs/google-drive-oauth.md.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { credentialStore } from '../credentials';
import { ProviderCredentials } from '../types';

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

/** Public OAuth client ID (Desktop app). Safe to ship; not a secret with PKCE. */
export function googleOAuthClientId(): string {
  const fromEnv = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim();
  return fromEnv || '';
}

export function isGoogleOAuthConfigured(): boolean {
  return googleOAuthClientId().length > 0;
}

export function isGoogleOAuthAvailable(): boolean {
  return isTauri() && isGoogleOAuthConfigured();
}

function expiresAtFromSeconds(expiresIn?: number): string | undefined {
  if (!expiresIn || expiresIn <= 0) return undefined;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/** Open the system browser and complete Google sign-in. Desktop only. */
export async function signInWithGoogle(): Promise<GoogleOAuthTokens> {
  if (!isTauri()) {
    throw new Error('Sign in with Google requires the Cloudbreak desktop app.');
  }
  const clientId = googleOAuthClientId();
  if (!clientId) {
    throw new Error(
      'Google OAuth client ID is not configured. Set VITE_GOOGLE_OAUTH_CLIENT_ID (see docs/google-drive-oauth.md).',
    );
  }
  return invoke<GoogleOAuthTokens>('google_oauth_sign_in', { clientId });
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
  const clientId = googleOAuthClientId();
  if (!clientId) {
    throw new Error('Google OAuth client ID is not configured.');
  }
  if (!isTauri()) {
    throw new Error('Refreshing Google tokens requires the desktop app.');
  }
  return invoke<GoogleOAuthTokens>('google_oauth_refresh', { clientId, refreshToken });
}

/**
 * Ensure Google Drive credentials have a non-expired access token.
 * Refreshes and persists when needed. No-op for pasted tokens without refresh.
 */
export async function ensureGoogleAccessToken(
  creds: ProviderCredentials,
): Promise<ProviderCredentials> {
  if (creds.provider !== 'Google Drive') return creds;

  const token = creds.accessToken?.trim();
  const refresh = creds.refreshToken?.trim();
  if (!token && !refresh) {
    throw new Error('Google Drive is not signed in');
  }

  const skewMs = 60_000;
  const expiresAt = creds.expiresAt ? Date.parse(creds.expiresAt) : NaN;
  const stillValid =
    Boolean(token)
    && (!Number.isFinite(expiresAt) || expiresAt - skewMs > Date.now());

  if (stillValid) return creds;

  if (!refresh) {
    if (token) return creds; // Playground / pasted token — use until API rejects it
    throw new Error('Google Drive access expired. Sign in with Google again.');
  }

  if (!isGoogleOAuthConfigured()) {
    throw new Error(
      'Google access expired and OAuth client ID is missing — cannot refresh. Reconfigure VITE_GOOGLE_OAUTH_CLIENT_ID and sign in again.',
    );
  }

  const next = await refreshGoogleAccessToken(refresh);
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

export function credentialsFromGoogleTokens(
  tokens: GoogleOAuthTokens,
  endpoint?: string,
): Pick<ProviderCredentials, 'accessToken' | 'refreshToken' | 'expiresAt' | 'endpoint'> {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: expiresAtFromSeconds(tokens.expiresIn),
    endpoint: endpoint || 'https://www.googleapis.com/drive/v3',
  };
}
