# Google Drive — official OAuth

Cloudbreak Files connects Google Drive with **Sign in with Google**: OAuth 2.0 PKCE, a loopback redirect (`http://127.0.0.1:<port>/`), and a refresh token stored in the OS keychain.

## One-time Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable **Google Drive API** (APIs & Services → Library).
3. Configure the **OAuth consent screen** (External or Internal).
   - App name: Cloudbreak Files (or your brand).
   - Add scopes: `.../auth/drive` and `.../auth/userinfo.email`.
   - While the app is in Testing, add your Google account under Test users.
4. Create credentials → **OAuth client ID** → Application type **Desktop app**.
5. Copy the **Client ID** (looks like `….apps.googleusercontent.com`).  
   There is **no client secret** in the Cloudbreak flow (public client + PKCE).

Google’s [loopback redirect](https://developers.google.com/identity/protocols/oauth2/native-app) for desktop clients does not require you to register a fixed port; Cloudbreak binds an ephemeral `127.0.0.1` port at sign-in time.

## Easier: Quick sign-in with rclone (no Google Cloud project)

If you don't want to create a client ID, use **Quick sign-in (no setup)**. Cloudbreak runs a bundled [rclone](https://rclone.org/) (MIT license), which signs you in with rclone's own Google app and lists your Drive.

- Release builds ship rclone (`npm run fetch:rclone`). In development it falls back to Homebrew or `PATH` (`brew install rclone`), or set `RCLONE_PATH`.
- The token is kept in the OS keychain (`rcloneToken`), never in an rclone config file. Each rclone run uses a throwaway config folder that is deleted afterwards, and your own `~/.config/rclone` is never read or changed.
- Trade-offs: Google's consent screen says "rclone", the shared Google app is rate-limited across all rclone users, and listing is capped at 400 items three levels deep (same cap as the other adapters). Opening or downloading a file from this account is not wired up yet.
- Use your own client ID (below) if you want your own branding and quota.

## Configure Cloudbreak

Create a `.env` (or `.env.local`) in the repo root — Vite loads `VITE_*` at build/dev time:

```bash
VITE_GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

Restart `npm run tauri dev` / rebuild so the value is baked into the UI.

The Client ID is not a secret for a public desktop client, but do **not** commit production keys you want to rotate privately if you prefer; use CI/env for release builds.

## What the app does

1. User chooses Google Drive → **Sign in with Google**.
2. Native code opens the system browser on Google’s authorize URL (PKCE + `access_type=offline`).
3. After consent, Google redirects to `http://127.0.0.1:<port>/`.
4. Cloudbreak exchanges the code for access + refresh tokens and saves them in the keychain.
5. Drive API calls go through the existing `cloud_http` proxy; access tokens are refreshed automatically before expiry.

## Advanced

Paste-an-access-token remains available for debugging (OAuth Playground). Those tokens expire quickly and do **not** refresh.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| “client ID is not configured” | Set `VITE_GOOGLE_OAUTH_CLIENT_ID` and restart the app. |
| `redirect_uri_mismatch` | Use a **Desktop** OAuth client (not Web). Loopback is built into desktop clients. |
| `access_denied` / app not verified | Add your account as a consent-screen test user, or publish the app. |
| Sign-in times out | Finish in the browser within 5 minutes; check firewall for localhost. |
| Works once then fails | Confirm a refresh token was stored (re-authorize with consent). |
