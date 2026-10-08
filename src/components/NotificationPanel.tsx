import React, { useState, useRef, useEffect } from 'react';
import {
  Bell, X, Check, Trash2, ShieldCheck, FolderDown, FolderUp,
  Radio, HardDrive, Wifi, ExternalLink, CheckCheck, Clock,
  ArrowRight, Shield, Sparkles, User, AlertCircle
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

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Only close if not clicking the toggle button which has group/notif-btn
        const target = e.target as HTMLElement;
        if (!target.closest('.notif-toggle-btn')) {
          onClose();
        }
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
    n => n.type === 'incoming_library' && n.status === 'pending'
  ).length;

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'invites') return n.type === 'incoming_library';
    if (filter === 'system') return n.type !== 'incoming_library';
    return true;
  });

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 md:w-[420px] max-h-[82vh] flex flex-col bg-[#0a0a0b] border border-[#2c2c2f] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#262629] bg-[#0e0e0f] select-none">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white tracking-tight">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-[10px] text-neutral-400 font-mono">P2P Swarm & System Updates</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="px-2 py-1 rounded-md text-[11px] text-neutral-400 hover:text-white hover:bg-[#202023] transition-colors flex items-center gap-1"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Read all</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-[#202023] transition-colors"
            title="Close notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#262629] bg-[#111113] text-xs select-none">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            filter === 'all'
              ? 'bg-[#2c2c30] text-white shadow-xs font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#19191b]'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('invites')}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
            filter === 'invites'
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 shadow-xs font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#19191b]'
          }`}
        >
          <span>P2P Invites</span>
          {pendingInvitesCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-neutral-950 font-bold text-[10px] flex items-center justify-center font-mono">
              {pendingInvitesCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setFilter('system')}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            filter === 'system'
              ? 'bg-[#2c2c30] text-white shadow-xs font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#19191b]'
          }`}
        >
          System & Security
        </button>
      </div>

      {/* Notifications Scroll List */}
      <div className="overflow-y-auto max-h-[60vh] divide-y divide-[#262629] p-2 space-y-2 bg-[#141416]">
        {filteredNotifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500 mb-2.5">
              <Bell className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-neutral-300">No notifications in this view</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Incoming P2P media requests and protocol events will appear here.
            </p>
          </div>
        ) : (
          filteredNotifications.map(notification => {
            const isInvite = notification.type === 'incoming_library';
            const isPending = notification.status === 'pending';
            const isAccepted = notification.status === 'accepted';
            const isDeclined = notification.status === 'declined';

            return (
              <div
                key={notification.id}
                className={`p-3 rounded-xl transition-all border ${
                  !notification.read
                    ? 'bg-[#1c1c1f] border-[#323236] shadow-sm'
                    : 'bg-[#0f0f10] border-[#1e1e21] hover:border-[#2c2c2f]'
                }`}
              >
                {/* Top Row: Type indicator & Timestamp */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {/* Badge Icon */}
                    {isInvite && (
                      <span className="p-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <FolderDown className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {notification.type === 'seeding_event' && (
                      <span className="p-1 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/30">
                        <FolderUp className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {notification.type === 'security' && (
                      <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {notification.type === 'storage' && (
                      <span className="p-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30">
                        <HardDrive className="w-3.5 h-3.5" />
                      </span>
                    )}

                    <span className="text-[11px] font-semibold text-white tracking-tight">
                      {notification.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-neutral-500 text-[10px] shrink-0 font-mono">
                    <span>{notification.timestamp}</span>
                    <button
                      type="button"
                      onClick={() => onClearNotification(notification.id)}
                      className="hover:text-red-400 p-0.5 rounded transition-colors"
                      title="Dismiss notification"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Sender & Message Details */}
                <p className="text-xs text-neutral-300 leading-snug mb-2 font-sans">
                  {notification.message}
                </p>

                {/* INCOMING P2P LIBRARY CARD PREVIEW & ACTIONS */}
                {isInvite && notification.libraryData && (
                  <div className="p-2.5 rounded-xl bg-[#0b0b0c] border border-emerald-500/30 space-y-2.5 my-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-bold text-xs text-emerald-300 shrink-0">
                        {notification.sender?.name ? notification.sender.name.charAt(0).toUpperCase() : 'P'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-semibold text-white truncate">
                            {notification.libraryData.name}
                          </h4>
                          <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/15 px-1.5 py-0.2 rounded border border-emerald-500/25 shrink-0">
                            E2EE P2P
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                          From: <strong className="text-neutral-200">{notification.sender?.name}</strong> ({notification.sender?.email})
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-neutral-400">
                          <span>{notification.libraryData.itemCount} Media Files</span>
                          <span>•</span>
                          <span>{formatBytes(notification.libraryData.sizeBytes)}</span>
                          <span>•</span>
                          <span className="text-emerald-400">{notification.libraryData.transferSpeed}</span>
                        </div>
                      </div>
                    </div>

                    {/* Protocol Tag */}
                    <div className="px-2 py-1 rounded bg-[#111113] border border-[#212124] flex items-center gap-1.5 text-[9px] font-mono text-neutral-300">
                      <Shield className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{notification.libraryData.p2pProtocol}</span>
                    </div>

                    {/* Action Buttons: Accept / Decline */}
                    {isPending && (
                      <div className="flex items-center gap-2 pt-1 border-t border-[#212124]">
                        <button
                          type="button"
                          onClick={() => onAcceptLibrary(notification.id)}
                          className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Accept Library</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeclineLibrary(notification.id)}
                          className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#19191b] hover:bg-[#2b181b] border border-[#323236] hover:border-red-500/30 text-neutral-300 hover:text-red-300 transition-all cursor-pointer"
                        >
                          <span>Decline</span>
                        </button>
                      </div>
                    )}

                    {isAccepted && (
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-xs">
                        <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                          <Check className="w-3.5 h-3.5" />
                          <span>Accepted & Added to Incoming P2P</span>
                        </span>
                        {onSelectLibrary && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                            }}
                            className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                          >
                            <span>Open in Finder</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {isDeclined && (
                      <div className="pt-1 border-t border-[#212124] text-[11px] text-neutral-500 italic">
                        Invitation declined
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[#262629] bg-[#0e0e0f] flex items-center justify-between text-[10px] text-neutral-400 font-mono select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Encrypted P2P Protocol Daemon Active</span>
        </div>
        <span>Cloudbreak Files</span>
      </div>
    </div>
  );
};
