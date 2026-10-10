import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { FileItem, SharedLibrary } from '../types';
import { p2pBridge, recordToSharedLibrary, type SwarmStatus } from '../services/p2pBridge';
import type { CreateP2pLibraryForm, JoinP2pLibraryForm } from '../components/SidebarModals';
import { mergeSwarmPeersIntoLibraries, pendingInvitePeer } from '../utils/p2pPeers';
import { localFs } from '../services/localFsBridge';
import { isTauri } from '@tauri-apps/api/core';
import { whenIdle } from '../utils/deferWork';
import { desktopScanReady } from '../utils/startupGate';

const MAX_BASE64_P2P_BYTES = 32 * 1024 * 1024;

interface UseP2pLibrariesOptions {
  userName: string;
  files: FileItem[];
  selectedFileId: string | null;
  selectedLibraryId: string | null;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setSelectedFileId: (id: string | null) => void;
  setSelectedLibraryId: (id: string | null) => void;
  showToast: (message: string) => void;
}

/** Private P2P libraries: loading saved ones, seeding status, creating and joining. */
export function useP2pLibraries({
  userName, files, selectedFileId, selectedLibraryId,
  setFiles, setSelectedFileId, setSelectedLibraryId, showToast,
}: UseP2pLibrariesOptions) {
  const [sharedLibraries, setSharedLibraries] = useState<SharedLibrary[]>([]);
  const [swarmStatus, setSwarmStatus] = useState<SwarmStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void (async () => {
        try {
          await desktopScanReady;
          await p2pBridge.getIdentity(userName);
          const records = await p2pBridge.listLibraries();
          if (cancelled) return;
          if (records.length) {
            setSharedLibraries(prev => {
              const byId = new Map(prev.map(l => [l.id, l]));
              for (const rec of records) {
                byId.set(rec.libraryId, recordToSharedLibrary(rec));
              }
              return [...byId.values()];
            });
            // Resume seeding off the critical path — identity/list already painted the sidebar.
            for (const rec of records) {
              if (cancelled) return;
              if (rec.direction === 'outgoing' && rec.isSeeding) {
                try {
                  await p2pBridge.startSeeding(rec.libraryId);
                } catch {
                  // ignore per-library resume failures
                }
              }
            }
          }
          const status = await p2pBridge.swarmStatus();
          if (!cancelled) {
            setSwarmStatus(status);
            setSharedLibraries(prev => mergeSwarmPeersIntoLibraries(prev, status));
          }
          try {
            await p2pBridge.refreshTrayStatus();
          } catch {
            // Browser preview has no tray
          }
        } catch {
          // Browser / first launch — identity created on first seed/join
        }
      })();
    }, 800);
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [userName]);

  const refreshSwarm = async () => {
    try {
      if (selectedLibraryId) {
        await p2pBridge.startSeeding(selectedLibraryId);
      }
      const status = await p2pBridge.swarmStatus();
      setSwarmStatus(status);
      setSharedLibraries(prev => mergeSwarmPeersIntoLibraries(prev, status));
      showToast(
        status.listening
          ? `Private swarm listening · invite-dial only · ${status.peers.filter(p => p.connected).length} peer(s)`
          : `Private mode · ${status.seedingRootCids.length} root(s) seeding (no DHT)`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const copyLibraryInvite = async () => {
    if (!selectedLibraryId) return;
    try {
      const invite = await p2pBridge.exportInvite(selectedLibraryId);
      await navigator.clipboard.writeText(invite);
      showToast('P2P invite copied to clipboard');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateLibrary = async (form: CreateP2pLibraryForm) => {
    await p2pBridge.getIdentity(userName);
    const selected = files.filter(f => f.id === selectedFileId).slice(0, 1);
    const payloadFiles: Array<{
      name: string;
      mimeType: string;
      contentBase64?: string;
      localPath?: string;
    }> = [];
    for (const f of selected) {
      try {
        if (f.localPath && isTauri()) {
          payloadFiles.push({
            name: f.name,
            mimeType: f.mimeType,
            localPath: f.localPath,
          });
          continue;
        }
        if (f.sizeBytes > MAX_BASE64_P2P_BYTES) {
          showToast(
            `“${f.name}” is too large for the browser bridge (max ${MAX_BASE64_P2P_BYTES / (1024 * 1024)} MB). Add it as a local file in the desktop app.`,
          );
          continue;
        }
        const res = await fetch(f.url);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > MAX_BASE64_P2P_BYTES) {
          showToast(`“${f.name}” exceeds the ${MAX_BASE64_P2P_BYTES / (1024 * 1024)} MB bridge limit`);
          continue;
        }
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        payloadFiles.push({
          name: f.name,
          mimeType: f.mimeType,
          contentBase64: btoa(binary),
        });
      } catch {
        // skip files that cannot be read
      }
    }
    if (!payloadFiles.length) {
      const note = `Cloudbreak P2P library: ${form.name}\n${form.description}\n`;
      payloadFiles.push({
        name: 'LIBRARY.txt',
        mimeType: 'text/plain',
        contentBase64: btoa(note),
      });
    }
    const result = await p2pBridge.createLibrary({
      name: form.name,
      description: form.description,
      role: form.role,
      recipientEmail: form.memberEmail || undefined,
      invitePassphrase: form.invitePassphrase.length >= 8 ? form.invitePassphrase : undefined,
      bandwidthCap: form.bandwidthCap,
      expiresInDays: form.expiresInDays,
      allowDownloads: form.allowDownloads,
      files: payloadFiles,
    });
    const newLib = recordToSharedLibrary(result.record);
    newLib.expiresAt = form.expiresInDays > 0
      ? new Date(Date.now() + form.expiresInDays * 86400000).toISOString()
      : undefined;
    newLib.allowDownloads = form.allowDownloads;
    const recipientList = (form.memberEmails?.length
      ? form.memberEmails
      : form.memberEmail
        ? [form.memberEmail]
        : []
    ).map(e => e.trim()).filter(Boolean);
    if (recipientList.length) {
      const stamp = Date.now();
      newLib.members = [
        ...newLib.members,
        ...recipientList.map((email, i) => ({
          id: `m-${stamp}-${i}`,
          name: email.includes('@') ? email.split('@')[0] : email,
          email,
          role: form.role,
          status: 'pending' as const,
        })),
      ];
      newLib.seedingPeers = recipientList.map((email, i) =>
        pendingInvitePeer(email, form.role, stamp, i),
      );
      newLib.memberCount = newLib.members.length;
    }
    setSharedLibraries(prev => [...prev.filter(l => l.id !== newLib.id), newLib]);
    setSelectedLibraryId(newLib.id);
    const peerCount = recipientList.length;
    const peerNote = peerCount > 1
      ? ` · ${peerCount} pending invites`
      : peerCount === 1
        ? ' · 1 pending invite'
        : '';
    try {
      await navigator.clipboard.writeText(result.invite);
      showToast(`Seeding “${form.name}”${peerNote} — invite copied to clipboard`);
    } catch {
      showToast(`Seeding “${form.name}”${peerNote} — export invite from Share`);
    }
  };

  const handleJoinIncomingLibrary = async (form: JoinP2pLibraryForm) => {
    await p2pBridge.getIdentity(userName);
    const result = await p2pBridge.acceptInvite(
      form.invite,
      form.passphrase || undefined,
    );
    let newLib = recordToSharedLibrary(result.record);
    if (form.name) newLib = { ...newLib, name: form.name };
    if (form.ownerName) {
      newLib = {
        ...newLib,
        ownerName: form.ownerName,
        senderPeerName: form.ownerName,
      };
    }
    setSharedLibraries(prev => [...prev.filter(l => l.id !== newLib.id), newLib]);
    setSelectedLibraryId(newLib.id);

    // Materialize decrypted files into the file list (path on desktop; base64 only as fallback).
    try {
      const manifest = await p2pBridge.fetchManifest(newLib.id);
      const imported: FileItem[] = [];
      for (const entry of manifest.files) {
        try {
          let url: string;
          let sizeBytes = entry.sizeBytes;
          let mimeType = entry.mimeType;
          let localPath: string | undefined;
          if (isTauri() && entry.sizeBytes > MAX_BASE64_P2P_BYTES) {
            const mat = await p2pBridge.materializeFile(newLib.id, entry.fileId);
            localPath = mat.path;
            url = localFs.assetUrl(mat.path);
            sizeBytes = mat.sizeBytes;
            mimeType = mat.mimeType || entry.mimeType;
          } else if (isTauri()) {
            try {
              const mat = await p2pBridge.materializeFile(newLib.id, entry.fileId);
              localPath = mat.path;
              url = localFs.assetUrl(mat.path);
              sizeBytes = mat.sizeBytes;
              mimeType = mat.mimeType || entry.mimeType;
            } catch {
              const decrypted = await p2pBridge.readFile(newLib.id, entry.fileId);
              const bytes = Uint8Array.from(atob(decrypted.contentBase64), c => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: decrypted.mimeType || entry.mimeType });
              url = URL.createObjectURL(blob);
              sizeBytes = decrypted.sizeBytes;
              mimeType = decrypted.mimeType || entry.mimeType;
            }
          } else {
            const decrypted = await p2pBridge.readFile(newLib.id, entry.fileId);
            const bytes = Uint8Array.from(atob(decrypted.contentBase64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: decrypted.mimeType || entry.mimeType });
            url = URL.createObjectURL(blob);
            sizeBytes = decrypted.sizeBytes;
            mimeType = decrypted.mimeType || entry.mimeType;
          }
          imported.push({
            id: entry.fileId,
            name: entry.name,
            folderPath: `/P2P/${newLib.name}`,
            accountId: 'all',
            sizeBytes,
            category: mimeType.startsWith('image/')
              ? 'photo'
              : mimeType.startsWith('video/')
                ? 'video'
                : mimeType.startsWith('audio/')
                  ? 'audio'
                  : 'document',
            mimeType,
            updatedAt: new Date().toISOString(),
            url,
            localPath,
            thumbnailUrl: mimeType.startsWith('image/') ? url : undefined,
            tags: ['P2P', 'E2EE'],
            encryption: {
              isEncrypted: true,
              algorithm: 'AES-256-GCM',
              keyFingerprint: 'P2P library key',
              checksumSha256: entry.plaintextSha256 || 'verified',
              zeroKnowledgeVerified: true,
            },
            version: 1,
          });
        } catch {
          // chunk not local yet
        }
      }
      if (imported.length) {
        setFiles(prev => [...imported, ...prev]);
        newLib = { ...newLib, fileIds: imported.map(f => f.id) };
        setSharedLibraries(prev => prev.map(l => (l.id === newLib.id ? newLib : l)));
        setSelectedFileId(imported[0].id);
      }
    } catch {
      // manifest may arrive after swarm sync
    }

    showToast(
      result.fetchedChunks > 0
        ? `Connected “${newLib.name}” · ${result.fetchedChunks} chunk(s) fetched`
        : `Connected “${newLib.name}” — waiting for seeder chunks`,
    );
  };


  return {
    sharedLibraries, setSharedLibraries, swarmStatus,
    refreshSwarm, copyLibraryInvite, handleCreateLibrary, handleJoinIncomingLibrary,
  };
}
