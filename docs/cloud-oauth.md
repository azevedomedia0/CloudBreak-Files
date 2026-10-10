# Dropbox, OneDrive and Nextcloud — official sign-in

Cloudbreak Files signs in to each provider the way the provider intends. Google Drive is covered in [`google-drive-oauth.md`](google-drive-oauth.md).

| Provider | Method | Stored in the OS keychain | Needs from you |
|---|---|---|---|
| Dropbox | OAuth 2.0 code + PKCE, loopback redirect, offline refresh token | refresh token | A Dropbox app (client ID) |
| OneDrive | Microsoft identity platform, OAuth 2.0 code + PKCE, loopback redirect | refresh token | An Entra app registration (client ID) |
| Nextcloud | Login Flow v2 (browser approval) | revocable app password | Nothing — enter your server address |
| MEGA | Email + password (no official third-party OAuth exists) | password | Nothing |

All flows are public-client flows: **no client secret is shipped.** The client IDs are not secrets.

## Dropbox

1. Open the [Dropbox App Console](https://www.dropbox.com/developers/apps) and create an app: **Scoped access**, **Full Dropbox**.
2. **Permissions** tab: enable `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`, then **Submit**.
3. **Settings** tab → **Redirect URIs**: add all of these (Dropbox matches them exactly, so Cloudbreak tries each port in turn):
   ```
   http://127.0.0.1:53682/
   http://127.0.0.1:53683/
   http://127.0.0.1:53684/
   http://127.0.0.1:53685/
   http://127.0.0.1:53686/
   ```
4. Copy the **App key** and set it as `VITE_DROPBOX_OAUTH_CLIENT_ID`.

Until Dropbox approves the app for production, only up to 50 accounts can link to it (development status).

## OneDrive

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/) → **App registrations** → **New registration**.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Mobile and desktop applications**, value `http://localhost`. Microsoft ignores the port for localhost, so Cloudbreak's ephemeral port works.
4. **API permissions** → Microsoft Graph → Delegated: `Files.ReadWrite`, `offline_access`, `User.Read`.
5. **Authentication** → enable **Allow public client flows**.
6. Copy the **Application (client) ID** and set it as `VITE_MICROSOFT_OAUTH_CLIENT_ID`.

Work or school tenants may require admin consent for `Files.ReadWrite`.

## Nextcloud

No setup. In Cloudbreak choose Nextcloud, enter the server address (for example `https://cloud.example.org`) and approve the request in the browser. Cloudbreak receives an app password and the WebDAV endpoint; the account password is never seen. Revoke it any time under **Settings → Security → Devices & sessions**.

Server addresses must be `https://` (plain `http://` is accepted only for `localhost`). Cloudbreak refuses a server that redirects the sign-in to a different origin.

## Configure Cloudbreak

Add to `.env` / `.env.local` (Vite reads `VITE_*` at build time) and restart `npm run tauri dev`, or set them in the release build environment:

```bash
VITE_DROPBOX_OAUTH_CLIENT_ID=your-dropbox-app-key
VITE_MICROSOFT_OAUTH_CLIENT_ID=your-entra-application-id
```

Without a client ID the sign-in button is disabled and says which variable to set. The paste-a-token option remains under **Advanced** for debugging; pasted tokens expire and do not refresh.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dropbox `redirect_uri` mismatch | Register all five `127.0.0.1` URIs above, with the trailing `/`. |
| "Could not open a sign-in port for Dropbox" | Another program holds ports 53682–53686. Close it and retry. |
| Microsoft `AADSTS50011` redirect mismatch | Use the *Mobile and desktop* platform with `http://localhost`, not *Web*. |
| Microsoft `AADSTS7000218` | Turn on **Allow public client flows**. |
| Microsoft `AADSTS65001` | Consent is required — approve in the browser, or ask a tenant admin. |
| Nextcloud "does not look like a Nextcloud server" | Check the address; Login Flow v2 needs Nextcloud 16 or newer. |
| Access stops after about an hour | No refresh token was stored. Re-authorize from the account's settings. |
