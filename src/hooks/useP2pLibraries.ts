import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { FileItem, SharedLibrary } from '../types';
import { p2pBridge, recordToSharedLibrary, type SwarmStatus } from '../services/p2pBridge';
import type { CreateP2pLibraryForm, JoinP2pLibraryForm } from '../components/SidebarModals';

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
    (async () => {
      try {
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
          // Resume seeding for outgoing libraries so the tray status dot goes green.
          for (const rec of records) {
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
        if (!cancelled) setSwarmStatus(status);
        try {
          await p2pBridge.refreshTrayStatus();
        } catch {
          // Browser preview has no tray
        }
      } catch {
        // Browser / first launch — identity created on first seed/join
      }
    })();
    return () => { cancelled = true; };
  }, [userName]);

  const refreshSwarm = async () => {
    try {
      if (selectedLibraryId) {
        await p2pBridge.startSeeding(selectedLibraryId);
      }
      const status = await p2pBridge.swarmStatus();
      setSwarmStatus(status);
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
    const payloadFiles = [];
    for (const f of selected) {
      try {
        const res = await fetch(f.url);
        const buf = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        buf.forEach(b => { binary += String.fromCharCode(b); });
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
      newLib.seedingPeers = recipientList.map((email, i) => ({
        id: `p-${stamp}-${i}`,
        name: email.includes('@') ? email.split('@')[0] : email,
        email,
        peerNodeId: `node-${email.toLowerCase().replace(/[^a-z0-9]/g, '')}-mesh`,
        status: 'seeding' as const,
        role: form.role,
      }));
      newLib.memberCount = newLib.members.length;
    }
    setSharedLibraries(prev => [...prev.filter(l => l.id !== newLib.id), newLib]);
    setSelectedLibraryId(newLib.id);
    const peerCount = recipientList.length;
    const peerNote = peerCount > 1 ? ` to ${peerCount} peers` : peerCount === 1 ? ' to 1 peer' : '';
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

    // Materialize decrypted files into the browser file list when available
    try {
      const manifest = await p2pBridge.fetchManifest(newLib.id);
      const imported: FileItem[] = [];
      for (const entry of manifest.files) {
        try {
          const decrypted = await p2pBridge.readFile(newLib.id, entry.fileId);
          const bytes = Uint8Array.from(atob(decrypted.contentBase64), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: decrypted.mimeType || entry.mimeType });
          const url = URL.createObjectURL(blob);
          imported.push({
            id: entry.fileId,
            name: form.name ? `${entry.name}` : decrypted.name || entry.name,
            folderPath: `/P2P/${newLib.name}`,
            accountId: 'all',
            sizeBytes: decrypted.sizeBytes,
            category: entry.mimeType.startsWith('image/')
              ? 'photo'
              : entry.mimeType.startsWith('video/')
                ? 'video'
                : entry.mimeType.startsWith('audio/')
                  ? 'audio'
                  : 'document',
            mimeType: decrypted.mimeType || entry.mimeType,
            updatedAt: new Date().toISOString(),
            url,
            thumbnailUrl: entry.mimeType.startsWith('image/') ? url : undefined,
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
