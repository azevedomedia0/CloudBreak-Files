# Privacy Policy

**Cloudbreak Files** · Effective 10 October 2026 · Published by Steven Azevedo / Azevedo Media

Cloudbreak Files is a desktop app that runs on your computer. We do not run a service that receives your files, accounts or usage. This policy explains what stays on your device and the few places the app connects to on its own.

## The short version

- **We collect nothing.** There are no Cloudbreak accounts, no analytics, no crash reporting and no advertising.
- **Your files and credentials stay on your device.** Passwords and sign-in tokens are kept in your operating system's keychain.
- **The app talks directly to services you choose** (Google Drive, Dropbox, OneDrive, MEGA, Nextcloud, other people's devices for shared libraries). We are not in the middle.
- **A few background requests happen automatically**: an update check on GitHub and font downloads from Google Fonts. These are listed below.
- The source code is public, so you can check all of this: <https://github.com/azevedomedia0/CloudBreak-Files>.

## What is stored on your device

| What | Where | Notes |
|---|---|---|
| Cloud sign-in tokens and passwords (Google, Dropbox, OneDrive, rclone token, MEGA and Nextcloud passwords) | OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) | Removed when you disconnect the account. In the browser preview only, they are kept in the browser's local storage. |
| Vault passphrase check | `vault.json` in the app data folder | Contains a verifier, never your passphrase. The encryption key lives in memory while the vault is unlocked. |
| Folders you added | `local_roots.json` in the app data folder | Paths only. The app can read only folders you added. |
| Preferences, profile name, theme, saved network servers, volume | App local storage | Never sent to us. |
| Private library data and your P2P identity keys | App data folder | Library contents are encrypted. |

On macOS the app data folder is `~/Library/Application Support/com.cloudbreak.files`.

## Services the app connects to

Requests go straight from your device to the service. We do not see them.

**Cloud accounts you connect.** When you connect an account, the app talks to that provider with your permission:

- **Google Drive** (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`). Access requested: your Drive files and your email address.
- **Dropbox** (`www.dropbox.com`, `api.dropboxapi.com`). Access requested: account info, and reading and writing files.
- **OneDrive** (`login.microsoftonline.com`, `graph.microsoft.com`). Access requested: reading and writing files, your basic profile, and offline access to renew sign-in.
- **MEGA** (`g.api.mega.co.nz`). Your MEGA email and password are sent to MEGA to log in.
- **Nextcloud** (the server address you enter). Sign-in uses a revocable app password.

These providers handle your data under their own privacy policies. File names, sizes and contents are loaded to show and manage your files in the app. They are not sent to us or to anyone else.

**Quick sign-in for Google Drive (rclone).** This option runs the open-source rclone tool, bundled with the app, on your computer. It signs in with rclone's own Google app, so Google's consent screen shows the name "rclone". rclone talks to Google from your device. Nothing goes through us.

**Update check (GitHub).** A short while after the app starts, it asks GitHub (`github.com`) whether a newer release exists. GitHub receives your IP address and standard request details such as the app's user agent. Updates are downloaded only when you choose to install them.

**Fonts (Google Fonts).** The app loads its interface fonts from Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) when it starts, and more fonts if you pick them in the document editor. Google receives your IP address and standard request details.

**Private libraries (peer to peer).** When you create, join or share a private library, the app connects directly to the devices named in an invite. There is no central server, tracker or public peer discovery. While a library is shared, the app listens for connections on TCP port 7421. People you share with can see your IP address and your library peer ID. File contents and library manifests are encrypted.

**Network shares.** If you save an SMB or NFS server, the app checks whether it is reachable by opening a connection to the address you saved.

Everything else (browsing local folders, photo and video editing, the vault, search and the terminal panel) works on your device without a network connection.

## Google API data

Cloudbreak Files' use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

- We request access to your Google Drive and your email address so you can browse and manage your Drive in the app and see which account is connected.
- This data is processed on your device only. It is not sent to us, sold, shared, used for advertising, or used to train AI models. No person at Cloudbreak can read it, because we never receive it.
- You can revoke access at any time at <https://myaccount.google.com/permissions>.

## Your choices

- **Disconnect an account** in the app to remove its credentials from your keychain.
- **Revoke access** with the provider: Google Account → Security → Third-party access; Dropbox → Settings → Connected apps; Microsoft account → Privacy → Apps and services; Nextcloud → Settings → Security → Devices & sessions.
- **Delete local data** by uninstalling the app and deleting its app data folder, and by removing the "com.cloudbreak.files" entries from your keychain.
- **Stop background requests** by blocking the app's network access with your firewall. Updates and fonts will then stop working.

## Children

Cloudbreak Files is not directed at children under 13, and we do not knowingly collect information from anyone.

## This website

The Cloudbreak Files website is hosted on GitHub Pages. It does not use analytics or cookies. Your browser loads fonts from Bunny Fonts, some logos from `cdn.simpleicons.org`, and asks GitHub's API for the latest release. Those services receive your IP address.

## Changes

If the app starts collecting or sending anything new, this policy will change first, and the new date will appear at the top. Earlier versions are in the repository history.

## Contact

Questions or concerns: open an issue at <https://github.com/azevedomedia0/CloudBreak-Files/issues>.
