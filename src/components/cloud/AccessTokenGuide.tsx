import React from 'react';
import { ExternalLink } from '@/src/icons';

type TokenProvider = 'Google Drive' | 'Dropbox' | 'OneDrive';

interface Guide {
  title: string;
  steps: string[];
  href: string;
  linkLabel: string;
  tip: string;
}

const GUIDES: Record<TokenProvider, Guide> = {
  'Google Drive': {
    title: 'Advanced: paste a Google Drive access token',
    steps: [
      'Prefer Sign in with Google in this dialog — it uses official OAuth with a refresh token.',
      'Only use a pasted token for debugging. Open Google OAuth 2.0 Playground (link below).',
      'In step 1, select Drive API v3 → https://www.googleapis.com/auth/drive (or drive.readonly).',
      'Authorize, then Exchange authorization code for tokens.',
      'Copy the Access token and paste it above. Playground tokens expire in about an hour and will not auto-refresh.',
    ],
    href: 'https://developers.google.com/oauthplayground/',
    linkLabel: 'Open Google OAuth Playground',
    tip: 'Official Sign in with Google needs a Desktop OAuth client ID (VITE_GOOGLE_OAUTH_CLIENT_ID). See docs/google-drive-oauth.md.',
  },
  Dropbox: {
    title: 'Advanced: paste a Dropbox access token',
    steps: [
      'Prefer Sign in with Dropbox in this dialog — it uses official OAuth with a refresh token.',
      'Open the Dropbox App Console and sign in.',
      'Create an app (Scoped access → Full Dropbox) or open an existing one.',
      'Under Permissions, enable files.metadata.read and files.content.read (add write scopes if you need uploads).',
      'Open the Settings tab for that app.',
      'Under OAuth 2, click Generate in “Generated access token”.',
      'Copy the token and paste it above. Keep it private — it can access your Dropbox files.',
    ],
    href: 'https://www.dropbox.com/developers/apps',
    linkLabel: 'Open Dropbox App Console',
    tip: 'Generated tokens do not refresh. Official sign-in needs VITE_DROPBOX_OAUTH_CLIENT_ID (docs/cloud-oauth.md).',
  },
  OneDrive: {
    title: 'Advanced: paste a OneDrive (Microsoft Graph) access token',
    steps: [
      'Prefer Sign in with Microsoft in this dialog — it uses official OAuth with a refresh token.',
      'Open Microsoft Graph Explorer and sign in with your Microsoft account.',
      'Click your profile / modify permissions and consent to Files.Read (or Files.ReadWrite).',
      'Run any simple call such as GET https://graph.microsoft.com/v1.0/me/drive to confirm access.',
      'Open the Access token tab in Graph Explorer and copy the token.',
      'Paste it above. Explorer tokens are short-lived (usually about an hour).',
    ],
    href: 'https://developer.microsoft.com/en-us/graph/graph-explorer',
    linkLabel: 'Open Microsoft Graph Explorer',
    tip: 'Official sign-in needs VITE_MICROSOFT_OAUTH_CLIENT_ID (docs/cloud-oauth.md). Pasted Graph tokens do not refresh.',
  },
};

export function isTokenProvider(provider: string): provider is TokenProvider {
  return provider === 'Google Drive' || provider === 'Dropbox' || provider === 'OneDrive';
}

/** Step-by-step help for pasting a provider access token. */
export const AccessTokenGuide: React.FC<{ provider: string }> = ({ provider }) => {
  if (!isTokenProvider(provider)) return null;
  const guide = GUIDES[provider];

  return (
    <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5 space-y-2.5">
      <div className="text-xs font-semibold text-sky-400">{guide.title}</div>
      <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-neutral-300 leading-relaxed">
        {guide.steps.map(step => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <a
        href={guide.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-500 hover:text-sky-400 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        {guide.linkLabel}
      </a>
      <p className="text-[10px] text-neutral-500 leading-relaxed border-t border-white/8 pt-2">
        {guide.tip}
      </p>
    </div>
  );
};
