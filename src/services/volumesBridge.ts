/**
 * Sidebar volume detection and network server probes (desktop app).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { RemovableDevice } from '../types';

export interface SidebarVolumeDto {
  id: string;
  name: string;
  mountPoint: string;
  volumeType: string;
  fileSystem: string;
  capacityBytes: number;
  freeBytes: number;
  encrypted: boolean;
  mounted: boolean;
  ejectable: boolean;
  connectionType: string;
  isNetwork: boolean;
  source: string;
}

export interface SavedNetworkServer {
  id: string;
  name: string;
  address: string;
  protocol: string;
}

export interface NetworkServerEntry {
  id: string;
  name: string;
  desc: string;
  online: boolean;
  protocol?: string;
  kind: 'saved' | 'mounted';
  mountPoint?: string;
}

const STORAGE_KEY = 'cloudbreak.saved_network_servers';

function mapVolumeType(raw: string): RemovableDevice['type'] {
  switch (raw) {
    case 'memory_card':
      return 'memory_card';
    case 'thunderbolt_raid':
      return 'thunderbolt_raid';
    default:
      return 'usb_drive';
  }
}

function mapConnectionType(raw: string): RemovableDevice['connectionType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('thunderbolt')) return 'Thunderbolt 4';
  if (lower.includes('cf') || lower.includes('sd')) return 'CFexpress / SD';
  if (lower.includes('usb-c') || lower.includes('usb c')) return 'USB-C 3.2';
  if (lower.includes('usb')) return 'USB 3.0';
  return 'USB 3.0';
}

export function volumeToRemovableDevice(v: SidebarVolumeDto): RemovableDevice {
  return {
    id: v.id,
    name: v.name,
    mountPoint: v.mountPoint,
    type: mapVolumeType(v.volumeType),
    fileSystem: v.fileSystem,
    capacityBytes: v.capacityBytes,
    freeBytes: v.freeBytes,
    encrypted: v.encrypted,
    mounted: v.mounted,
    ejectable: v.ejectable,
    connectionType: mapConnectionType(v.connectionType),
  };
}

export function mountedVolumeToNetworkServer(v: SidebarVolumeDto): NetworkServerEntry {
  return {
    id: v.id,
    name: v.name,
    desc: v.source || v.mountPoint,
    online: true,
    protocol: v.connectionType,
    kind: 'mounted',
    mountPoint: v.mountPoint,
  };
}

export async function listSidebarVolumes(): Promise<SidebarVolumeDto[]> {
  if (!isTauri()) return [];
  return invoke<SidebarVolumeDto[]>('list_sidebar_volumes');
}

export async function probeNetworkServer(address: string, protocol: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('probe_network_server', { address, protocol });
}

export async function openNetworkShare(protocol: string, address: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('Connect to server is available in the desktop app.');
  }
  await invoke('open_network_share', { protocol, address });
}

export async function ejectVolume(mountPoint: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('Eject is available in the desktop app.');
  }
  await invoke('eject_volume', { mountPoint });
}

export function loadSavedNetworkServers(): SavedNetworkServer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedNetworkServer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedNetworkServers(servers: SavedNetworkServer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  } catch {
    // ignore quota / private mode
  }
}
