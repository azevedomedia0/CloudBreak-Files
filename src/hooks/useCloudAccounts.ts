import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { CloudAccount, CloudProviderId, FileItem, FolderItem } from '../types';
import { cloudService, credentialStore } from '../services/cloud';
import { buildCloudAccount } from '../utils/cloudAccount';
import type { MountedCloudResult } from '../components/AddAccountModal';
import type { CloudSyncPayload } from '../components/CloudProviderIntegrationModal';
import { whenIdle } from '../utils/deferWork';
import { desktopScanReady } from '../utils/startupGate';

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

    void (async () => {
      await cloudService.disconnect(accountId as CloudProviderId);
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
    })();
  };

  // Hydrate credentials after first paint; sync accounts in parallel so one slow
  // provider cannot serialize launch.
  useEffect(() => {
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void (async () => {
        await desktopScanReady;
        await cloudService.hydrateCredentials();
        if (cancelled) return;
        const credsList = credentialStore.list();
        // Show offline placeholders immediately so the sidebar fills without waiting on network.
        for (const creds of credsList) {
          const account = buildCloudAccount(creds.provider, null, creds.endpoint);
          setAccounts(prev => [...prev.filter(a => a.id !== account.id), account]);
        }
        const results = await Promise.allSettled(
          credsList.map(async creds => {
            const synced = await cloudService.syncAccount(creds.accountId);
            if (!synced) throw new Error('sync returned empty');
            return { creds, synced };
          }),
        );
        if (cancelled) return;
        const failed: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const creds = credsList[i];
          if (result.status === 'fulfilled') {
            const { synced } = result.value;
            const account = buildCloudAccount(creds.provider, synced.info, creds.endpoint);
            setAccounts(prev => [...prev.filter(a => a.id !== account.id), account]);
            applyCloudLibrary(account.id, synced.library);
          } else {
            failed.push(buildCloudAccount(creds.provider, null, creds.endpoint).name);
          }
        }
        if (failed.length) showToast(`Could not reach ${failed.join(', ')}. Shown as offline.`);
      })();
    }, 400);
    return () => {
      cancelled = true;
      cancelIdle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    accounts, setAccounts, disconnectedAccountIds,
    handleMountCloudAccount, handleSyncCloudLibrary, handleDisconnectAccount,
  };
}
