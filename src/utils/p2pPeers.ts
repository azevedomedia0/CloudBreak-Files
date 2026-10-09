/**
 * Honest P2P recipient status — pending invites until a real swarm peer connects.
 */

import type { P2PPeer, SharedLibrary } from '../types';
import type { SwarmStatus } from '../services/p2pBridge';

/** Invitee shown as waiting — no fake node IDs or transfer speeds. */
export function pendingInvitePeer(
  email: string,
  role: P2PPeer['role'],
  stamp: number,
  index: number,
): P2PPeer {
  const name = email.includes('@') ? email.split('@')[0] : email;
  return {
    id: `p-${stamp}-${index}`,
    name,
    email,
    status: 'pending',
    role,
  };
}

/** Shorten a libp2p peer id for display. */
export function shortPeerId(peerId: string): string {
  if (peerId.length <= 16) return peerId;
  return `${peerId.slice(0, 8)}…${peerId.slice(-6)}`;
}

/**
 * Merge connected swarm peers into library seedingPeers.
 * Invite emails stay `pending` until a matching peerId is known; anonymous
 * connected peers are listed with their real peer id.
 */
export function mergeSwarmPeersIntoLibraries(
  libraries: SharedLibrary[],
  swarm: SwarmStatus | null,
): SharedLibrary[] {
  if (!swarm) return libraries;
  const connected = swarm.peers.filter(p => p.connected);
  if (!connected.length) {
    return libraries.map(lib => ({
      ...lib,
      seedingPeers: (lib.seedingPeers || []).map(p =>
        p.status === 'connected' && p.peerNodeId && !connected.some(c => c.peerId === p.peerNodeId)
          ? { ...p, status: 'pending' as const, transferSpeed: undefined, progressPercent: undefined }
          : p,
      ),
      p2pSwarmPeers: 0,
    }));
  }

  return libraries.map(lib => {
    if (lib.direction !== 'outgoing') {
      return { ...lib, p2pSwarmPeers: connected.length };
    }
    const existing = [...(lib.seedingPeers || [])];
    const knownIds = new Set(
      existing.map(p => p.peerNodeId).filter((id): id is string => !!id),
    );
    for (const sp of connected) {
      if (knownIds.has(sp.peerId)) {
        const idx = existing.findIndex(p => p.peerNodeId === sp.peerId);
        if (idx >= 0) {
          existing[idx] = {
            ...existing[idx],
            status: 'connected',
            transferSpeed: sp.transferBytes > 0
              ? `${formatTransferHint(sp.transferBytes)}`
              : undefined,
          };
        }
        continue;
      }
      // Attach first pending invitee slot to this real peer id when available.
      const pendingIdx = existing.findIndex(p => p.status === 'pending' && !p.peerNodeId);
      if (pendingIdx >= 0) {
        existing[pendingIdx] = {
          ...existing[pendingIdx],
          peerNodeId: sp.peerId,
          status: 'connected',
          transferSpeed: sp.transferBytes > 0
            ? formatTransferHint(sp.transferBytes)
            : undefined,
        };
        knownIds.add(sp.peerId);
        continue;
      }
      existing.push({
        id: `swarm-${sp.peerId}`,
        name: shortPeerId(sp.peerId),
        email: '',
        peerNodeId: sp.peerId,
        status: 'connected',
        role: 'viewer',
        transferSpeed: sp.transferBytes > 0 ? formatTransferHint(sp.transferBytes) : undefined,
      });
      knownIds.add(sp.peerId);
    }
    return {
      ...lib,
      seedingPeers: existing,
      p2pSwarmPeers: connected.length,
      memberCount: Math.max(lib.memberCount, existing.length + 1),
    };
  });
}

function formatTransferHint(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function peerStatusLabel(peer: P2PPeer): string {
  switch (peer.status) {
    case 'pending':
      return 'Pending invite';
    case 'connected':
      return 'Connected';
    case 'seeding':
      return peer.transferSpeed ? `Seeding (${peer.transferSpeed})` : 'Seeding';
    case 'idle':
      return 'Idle';
    default:
      return peer.status;
  }
}
