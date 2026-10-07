import dropbox from './dropbox.png';
import googleDrive from './google-drive.png';
import megaDrive from './mega-drive.png';
import nextcloud from './nextcloud.png';
import onedrive from './onedrive.png';

/** Logo image for each cloud provider, keyed by the account's `provider` name. */
export const PROVIDER_LOGOS: Record<string, string> = {
  'Google Drive': googleDrive,
  Dropbox: dropbox,
  OneDrive: onedrive,
  'MEGA Drive': megaDrive,
  Nextcloud: nextcloud,
};
