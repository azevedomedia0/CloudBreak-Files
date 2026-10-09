import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { CloudAccount, CloudProviderId, FileItem, FolderItem } from '../types';
import { cloudService, credentialStore } from '../services/cloud';
import { buildCloudAccount } from '../utils/cloudAccount';
import type { MountedCloudResult } from '../components/AddAccountModal';
import type { CloudSyncPayload } from '../components/CloudProviderIntegrationModal';

interface UseCloudAccountsOptions {
  files: FileItem[];
  selectedFileId: string | null;
  selectedAccountId: CloudProviderId;
  setFolders: Dispatch<SetStateAction<FolderItem[]>>;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setSelectedFileId: (id: string | null) => void;
  setSelectedAccountId: (id: CloudProviderId) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedLibraryId: (id: string | null) => void;
  setSelectedSourceId: (id: string | null) => void;
  showToast: (message: string) => void;
}

/** Connected cloud accounts: mount, sync, disconnect, and restore saved connections at launch. */
export function useCloudAccounts({
  files, selectedFileId, selectedAccountId,
  setFolders, setFiles, setSelectedFileId,
  setSelectedAccountId, setSelectedFolderId, setSelectedLibraryId, setSelectedSourceId,
  showToast,
}: UseCloudAccountsOptions) {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [disconnectedAccountIds, setDisconnectedAccountIds] = useState<ReadonlySet<string>>(new Set());

  const applyCloudLibrary = (accountId: CloudProviderId, library: { folders: FolderItem[]; files: FileItem[] }) => {
    setFolders(prev => [
      ...prev.filter(folder => folder.accountId !== accountId),
      ...library.folders,
    ]);
    setFiles(prev => [
      ...prev.filter(file => file.accountId !== accountId),
      ...library.files,
    ]);
  };

  const handleMountCloudAccount = (result: MountedCloudResult) => {
    const { account, folders: remoteFolders, files: remoteFiles, note } = result;
    setDisconnectedAccountIds(prev => {
      const next = new Set(prev);
      next.delete(account.id);
      return next;
    });
    setAccounts(prev => {
      const without = prev.filter(a => a.id !== account.id);
      return [...without, account];
    });
    applyCloudLibrary(account.id, { folders: remoteFolders, files: remoteFiles });
    setSelectedAccountId(account.id);
    setSelectedFolderId(null);
    setSelectedLibraryId(null);
    setSelectedSourceId(null);
    showToast(note || `Mounted ${account.name} · ${remoteFiles.length} files`);
  };

  const handleSyncCloudLibrary = (payload: CloudSyncPayload) => {
    setAccounts(prev => prev.map(a => a.id === payload.account.id ? payload.account : a));
    applyCloudLibrary(payload.account.id, {
      folders: payload.folders,
      files: payload.files,
    });
    if (payload.note) showToast(payload.note);
  };

  const handleDisconnectAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    cloudService.disconnect(accountId as CloudProviderId);
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    setFolders(prev => prev.filter(folder => folder.accountId !== accountId));
    setFiles(prev => prev.filter(file => file.accountId !== accountId));
    setDisconnectedAccountIds(prev => new Set(prev).add(accountId));

    if (selectedAccountId === accountId) {
      setSelectedAccountId('all');
      setSelectedFolderId(null);
      setSelectedLibraryId(null);
      setSelectedSourceId(null);
    }
    const selected = files.find(f => f.id === selectedFileId);
    if (selected?.accountId === accountId) setSelectedFileId(null);

    showToast(`Disconnected ${account.name}. Your files stay in the provider.`);
  };

  // Re-sync every saved connection once at launch. An unreachable one shows as offline.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const failed: string[] = [];
      for (const creds of credentialStore.list()) {
        try {
          const synced = await cloudService.syncAccount(creds.accountId);
          if (cancelled || !synced) continue;
          const account = buildCloudAccount(creds.provider, synced.info, creds.endpoint);
          setAccounts(prev => [...prev.filter(a => a.id !== account.id), account]);
          applyCloudLibrary(account.id, synced.library);
        } catch {
          if (cancelled) return;
          const account = buildCloudAccount(creds.provider, null, creds.endpoint);
          setAccounts(prev => [...prev.filter(a => a.id !== account.id), account]);
          failed.push(account.name);
        }
      }
      if (failed.length) showToast(`Could not reach ${failed.join(', ')}. Shown as offline.`);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    accounts, setAccounts, disconnectedAccountIds,
    handleMountCloudAccount, handleSyncCloudLibrary, handleDisconnectAccount,
  };
}
