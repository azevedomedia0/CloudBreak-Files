import { useState } from 'react';
import type { AppNotification, SharedLibrary } from '../types';
import { buildLibraryFromNotification } from '../utils/libraryBuilders';

interface UseNotificationsOptions {
  setSharedLibraries: (update: (prev: SharedLibrary[]) => SharedLibrary[]) => void;
  setSelectedLibraryId: (id: string | null) => void;
  setSelectedFolderId: (id: string | null) => void;
  showToast: (message: string) => void;
}

/** Notification list plus the accept / decline / clear actions. */
export function useNotifications({
  setSharedLibraries, setSelectedLibraryId, setSelectedFolderId, showToast,
}: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);

  const handleAcceptLibraryNotification = (notificationId: string) => {
    const notif = notifications.find(n => n.id === notificationId);
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
    notifications, isNotificationOpen, setIsNotificationOpen,
    handleAcceptLibraryNotification, handleDeclineLibraryNotification,
    handleMarkAllNotificationsRead, handleClearNotification,
  };
}
