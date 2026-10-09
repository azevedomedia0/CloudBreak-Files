import { AppNotification, CloudProviderId, SharedLibrary, SharedMember } from '../types';

// Sample data builders for shared P2P libraries. They do not talk to a network yet.

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

const youAsMember = (role: SharedMember['role'], label: string): SharedMember => ({
  id: 'm-1',
  name: `Steven Azevedo (${label})`,
  email: 'you@example.com',
  role,
  status: 'active',
});

export function buildOutgoingLibrary(opts: {
  name: string;
  description: string;
  memberEmail: string;
  memberEmails?: string[];
  role: 'viewer' | 'editor' | 'admin';
  accountId: CloudProviderId;
}): SharedLibrary {
  const { name, description, role, accountId } = opts;
  const recipientList = (opts.memberEmails?.length
    ? opts.memberEmails
    : opts.memberEmail
      ? [opts.memberEmail]
      : []
  ).map(e => e.trim()).filter(Boolean);
  const members: SharedMember[] = [youAsMember('admin', 'Seeder Host')];
  const seedingPeers: NonNullable<SharedLibrary['seedingPeers']> = [];
  const stamp = Date.now();

  recipientList.forEach((memberEmail, i) => {
    const peerName = memberEmail.includes('@') ? memberEmail.split('@')[0] : memberEmail;
    members.push({
      id: `m-${stamp}-${i}`,
      name: peerName,
      email: memberEmail,
      role,
      status: 'pending',
    });
    seedingPeers.push({
      id: `p-${stamp}-${i}`,
      name: peerName,
      email: memberEmail,
      status: 'pending' as const,
      role,
    });
  });

  return {
    id: `lib-${Date.now()}`,
    name,
    description: description || 'Media library currently seeding to specified P2P users',
    ownerName: 'Steven Azevedo',
    ownerEmail: 'you@example.com',
    memberCount: members.length,
    accountId,
    fileIds: ['file-photo-1', 'file-vid-1'],
    role: 'owner',
    e2eeProtected: true,
    createdAt: new Date().toISOString(),
    direction: 'outgoing',
    isSeeding: true,
    seedingStatus: 'active',
    p2pProtocol: 'Zero-Knowledge P2P Seeder',
    p2pEncryptionCipher: 'AES-256-GCM E2EE Stream',
    transferSpeed: '24.5 MB/s',
    seedingBandwidthCap: '100 MB/s',
    seedingPeers,
    members,
  };
}

export function buildIncomingLibrary(name: string, ownerName: string): SharedLibrary {
  const ownerEmail = `${ownerName.toLowerCase().replace(/\s+/g, '')}@example.org`;
  return {
    id: `lib-${Date.now()}`,
    name,
    description: `Incoming media library from ${ownerName} received via encrypted P2P protocol`,
    ownerName,
    ownerEmail,
    memberCount: 2,
    accountId: 's3',
    fileIds: ['file-photo-1', 'file-photo-3'],
    role: 'editor',
    e2eeProtected: true,
    createdAt: new Date().toISOString(),
    direction: 'incoming',
    senderPeerName: ownerName,
    senderPeerEmail: ownerEmail,
    senderPeerNodeId: `peer-${slug(ownerName)}-node`,
    p2pProtocol: 'Encrypted P2P (Noise XX + AES-256-GCM)',
    p2pEncryptionCipher: 'AES-256-GCM Zero-Knowledge',
    p2pSwarmPeers: 3,
    incomingStatus: 'synced',
    transferSpeed: '48.2 MB/s',
    members: [
      { id: `m-${Date.now()}`, name: `${ownerName} (Sender Peer)`, email: ownerEmail, role: 'admin', status: 'active' },
      youAsMember('editor', 'You'),
    ],
  };
}

/** The caller must check that the notification has `libraryData` and `sender`. */
export function buildLibraryFromNotification(notif: AppNotification): SharedLibrary {
  const data = notif.libraryData!;
  const sender = notif.sender!;
  return {
    id: `lib-${Date.now()}`,
    name: data.name,
    description: data.description,
    coverImage: data.coverImage,
    ownerName: sender.name,
    ownerEmail: sender.email,
    memberCount: 2,
    accountId: 's3',
    fileIds: data.fileIds || ['file-photo-1', 'file-photo-2'],
    role: 'editor',
    e2eeProtected: true,
    createdAt: new Date().toISOString(),
    direction: 'incoming',
    senderPeerName: sender.name,
    senderPeerEmail: sender.email,
    senderPeerNodeId: sender.peerNodeId,
    p2pProtocol: data.p2pProtocol,
    p2pEncryptionCipher: 'AES-256-GCM Zero-Knowledge',
    p2pSwarmPeers: 3,
    incomingStatus: 'synced',
    transferSpeed: data.transferSpeed,
    members: [
      { id: `m-${Date.now()}`, name: `${sender.name} (Sender Peer)`, email: sender.email, role: 'admin', status: 'active' },
      youAsMember('editor', 'You'),
    ],
  };
}
