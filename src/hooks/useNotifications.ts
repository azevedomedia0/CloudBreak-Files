import { useState } from 'react';
import type { AppNotification, SharedLibrary } from '../types';
import { buildLibraryFromNotification } from '../utils/libraryBuilders';
import { looksLikeInvite, parseInvitePreview, shortPeerId } from '../utils/invitePreview';
import type { JoinP2pLibraryForm } from '../components/SidebarModals';

interface UseNotificationsOptions {
  setSharedLibraries: (update: (prev: SharedLibrary[]) => SharedLibrary[]) => void;
  setSelectedLibraryId: (id: string | null) => void;
  setSelectedFolderId: (id: string | null) => void;
  showToast: (message: string) => void;
  /** Join a library for real, as the Join dialog does (decrypts, fetches, adds it to Shared By Others). */
  joinLibrary: (form: JoinP2pLibraryForm) => Promise<void>;
  /** Libraries already here, so an invite for one of them is not offered again. */
  existingLibraryIds: string[];
  /** Open the Join dialog with this invite filled in (for one that needs a passphrase). */
  openJoinDialog: (invite: string) => void;
}

/** Notification list plus the accept / decline / clear actions. */
export function useNotifications({
  setSharedLibraries, setSelectedLibraryId, setSelectedFolderId, showToast,
  joinLibrary, existingLibraryIds, openJoinDialog,
}: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);

  /**
   * An invite that reached the app (pasted, for now) becomes a notification offering to join. Returns what
   * happened so the caller can open the panel or say why not.
   */
  const addInviteNotification = (text: string): 'added' | 'duplicate' | 'already-joined' | 'invalid' => {
    const invite = text.trim();
    const preview = looksLikeInvite(invite) ? parseInvitePreview(invite) : null;
    if (!preview) return 'invalid';
    if (existingLibraryIds.includes(preview.libraryId)) return 'already-joined';
    if (notifications.some(n => n.invite === invite && n.status === 'pending')) return 'duplicate';
    const expires = preview.expiresAt > 0 ? ` · expires ${new Date(preview.expiresAt * 1000).toLocaleDateString()}` : '';
    const notification: AppNotification = {
      id: `invite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'incoming_library',
      title: 'New library invite',
      message: `"${preview.libraryName}" from ${shortPeerId(preview.seederPeerId)}${expires}`,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      read: false,
      sender: { name: shortPeerId(preview.seederPeerId), email: '', peerNodeId: preview.seederPeerId },
      status: 'pending',
      invite,
    };
    setNotifications(prev => [notification, ...prev]);
    return 'added';
  };

  const joinFromNotification = async (notif: AppNotification) => {
    const invite = notif.invite!;
    const name = parseInvitePreview(invite)?.libraryName ?? 'library';
    try {
      await joinLibrary({ name: '', invite, ownerName: '', passphrase: '' });
      setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, read: true, status: 'accepted' as const } : n)));
      showToast(`Joined "${name}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // An invite sent with its own passphrase fails to decrypt without it: ask for it in the Join dialog.
      if (/decrypt|passphrase/i.test(message)) {
        showToast(`"${name}" needs the passphrase its sender chose. Enter it to join.`);
        openJoinDialog(invite);
      } else {
        showToast(`Could not join "${name}": ${message}`);
      }
    }
  };

  const handleAcceptLibraryNotification = (notificationId: string) => {
    const notif = notifications.find(n => n.id === notificationId);
    if (notif?.invite && notif.type === 'incoming_library' && notif.status === 'pending') {
      void joinFromNotification(notif);
      return;
    }
    if (!notif || notif.type !== 'incoming_library' || !notif.libraryData || !notif.sender) return;

    const newLib = buildLibraryFromNotification(notif);
    setSharedLibraries(prev => [newLib, ...prev]);
    setSelectedLibraryId(newLib.id);
    setSelectedFolderId(null);

    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, read: true, status: 'accepted' as const }
          : n
      )
    );

    showToast(`Accepted incoming P2P library "${notif.libraryData.name}"`);
  };

  const handleDeclineLibraryNotification = (notificationId: string) => {
    const notif = notifications.find(n => n.id === notificationId);
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, read: true, status: 'declined' as const }
          : n
      )
    );
    showToast(notif ? `Declined invitation for "${notif.libraryData?.name || notif.title}"` : 'Declined invitation');
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('All notifications marked as read');
  };

  const handleClearNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  return {
    notifications, isNotificationOpen, setIsNotificationOpen, addInviteNotification,
    handleAcceptLibraryNotification, handleDeclineLibraryNotification,
    handleMarkAllNotificationsRead, handleClearNotification,
  };
}
