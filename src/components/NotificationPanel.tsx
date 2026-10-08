import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, X, Check, Trash2, ShieldCheck, FolderDown, FolderUp,
  HardDrive, CheckCheck, ArrowRight,
} from 'lucide-react';
import { AppNotification } from '../types';
import { formatBytes } from '../utils/format';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onAcceptLibrary: (notificationId: string) => void;
  onDeclineLibrary: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onClearNotification: (notificationId: string) => void;
  onSelectLibrary?: (libraryId: string) => void;
}

function TypeIcon({ type }: { type: AppNotification['type'] }) {
  if (type === 'incoming_library') {
    return (
      <span className="w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center justify-center shrink-0">
        <FolderDown className="w-3 h-3" />
      </span>
    );
  }
  if (type === 'seeding_event') {
    return (
      <span className="w-6 h-6 rounded-md bg-sky-500/15 text-sky-300 border border-sky-400/25 flex items-center justify-center shrink-0">
        <FolderUp className="w-3 h-3" />
      </span>
    );
  }
  if (type === 'security') {
    return (
      <span className="w-6 h-6 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-400/25 flex items-center justify-center shrink-0">
        <ShieldCheck className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-md bg-amber-500/15 text-amber-300 border border-amber-400/25 flex items-center justify-center shrink-0">
      <HardDrive className="w-3 h-3" />
    </span>
  );
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  notifications,
  onAcceptLibrary,
  onDeclineLibrary,
  onMarkAllAsRead,
  onClearNotification,
  onSelectLibrary,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'invites' | 'system'>('all');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('.notif-toggle-btn')) onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.read).length;
  const pendingInvitesCount = notifications.filter(
    n => n.type === 'incoming_library' && n.status === 'pending',
  ).length;

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'invites') return n.type === 'incoming_library';
    if (filter === 'system') return n.type !== 'incoming_library';
    return true;
  });

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-h-[70vh] flex flex-col bg-[#0a0a0b] border border-[#2c2c2f] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#262629] bg-[#0e0e0f] select-none">
        <div className="flex items-center gap-2 min-w-0">
          <Bell className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          <span className="text-xs font-semibold text-white tracking-tight">Alerts</span>
          {unreadCount > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-px rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/25 font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-[#202023] transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-[#202023] transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#262629] bg-[#111113] select-none">
        {([
          { id: 'all' as const, label: `All ${notifications.length}` },
          { id: 'invites' as const, label: pendingInvitesCount ? `P2P ${pendingInvitesCount}` : 'P2P' },
          { id: 'system' as const, label: 'System' },
        ]).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
              filter === tab.id
                ? tab.id === 'invites'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-[#2c2c30] text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#19191b]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto max-h-[52vh] p-1.5 space-y-1 bg-[#141416]">
        {filteredNotifications.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center px-3">
            <Bell className="w-4 h-4 text-neutral-500 mb-1.5" />
            <p className="text-[11px] text-neutral-400">No alerts here</p>
          </div>
        ) : (
          filteredNotifications.map(notification => {
            const isInvite = notification.type === 'incoming_library';
            const isPending = notification.status === 'pending';
            const isAccepted = notification.status === 'accepted';
            const isDeclined = notification.status === 'declined';
            const lib = notification.libraryData;

            return (
              <div
                key={notification.id}
                className={`px-2 py-1.5 rounded-lg border transition-colors ${
                  !notification.read
                    ? 'bg-[#1c1c1f] border-[#323236]'
                    : 'bg-[#0f0f10] border-[#1e1e21] hover:border-[#2c2c2f]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <TypeIcon type={notification.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-white truncate flex-1">
                        {notification.title}
                      </span>
                      <span className="text-[9px] text-neutral-500 font-mono shrink-0">
                        {notification.timestamp}
                      </span>
                      <button
                        type="button"
                        onClick={() => onClearNotification(notification.id)}
                        className="text-neutral-500 hover:text-red-400 p-0.5 rounded shrink-0"
                        title="Dismiss"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-snug truncate mt-0.5">
                      {notification.message}
                    </p>

                    {isInvite && lib && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-neutral-200 font-medium truncate max-w-[9rem]">
                          {lib.name}
                        </span>
                        <span className="text-[9px] font-mono text-neutral-500">
                          {lib.itemCount} · {formatBytes(lib.sizeBytes)}
                        </span>
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => onAcceptLibrary(notification.id)}
                              className="ml-auto h-6 px-2 rounded-md text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeclineLibrary(notification.id)}
                              className="h-6 px-2 rounded-md text-[10px] font-medium bg-[#19191b] border border-[#323236] text-neutral-300 hover:text-red-300 hover:border-red-500/30"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {isAccepted && (
                          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
                            <Check className="w-3 h-3" />
                            Added
                            {onSelectLibrary && (
                              <button
                                type="button"
                                onClick={onClose}
                                className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                              >
                                Open <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        )}
                        {isDeclined && (
                          <span className="ml-auto text-[10px] text-neutral-500">Declined</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
