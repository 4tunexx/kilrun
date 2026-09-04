'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Loader2,
  LogOut,
  Mail,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { NicknameEffectText } from '@/components/nickname-effect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getConversations,
  getMyFriendshipMap,
  getNotifications,
  searchPlayers,
  sendFriendRequest,
} from '@/lib/social-actions';
import { getLevelFromXp } from '@/lib/progression';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type SearchHit = {
  id: string;
  username: string;
  avatarUrl: string;
  role?: string;
  isVip?: boolean;
  xpProgress?: number;
  currentRank?: string;
  equippedFrameConfig?: unknown | null;
  equippedNicknameConfig?: unknown | null;
};

type NotifRow = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date | string;
};

type ConvoRow = {
  peer: {
    id: string;
    username: string;
    avatarUrl: string;
    role?: string;
    isVip?: boolean;
    equippedFrameConfig?: unknown | null;
    equippedNicknameConfig?: unknown | null;
  };
  lastMessage: string;
  createdAt: Date | string;
  unread: number;
};

/** Renders above the whole hub (portaled) so hero/header never cover it. */
function SlidePanel({
  open,
  anchorRef,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      data-hub-popover
      className="fixed z-[9999] w-80 max-w-[min(20rem,calc(100vw-1rem))] rounded-xl border border-slate-700/40 bg-slate-900/95 backdrop-blur-md shadow-2xl overflow-hidden origin-top animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ top: pos.top, right: pos.right }}
    >
      {children}
    </div>,
    document.body
  );
}

export function HubHeaderToolbar({
  unreadCount,
  unreadMessages = 0,
  currentUserId,
  onOpenFriends,
  onOpenNotifications,
  onOpenMessages,
  onLogout,
  onOpenProfile,
}: {
  unreadCount: number;
  unreadMessages?: number;
  currentUserId?: string;
  onOpenFriends: () => void;
  onOpenNotifications: () => void;
  onOpenMessages: () => void;
  onLogout: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [friendMap, setFriendMap] = useState<
    Record<string, 'friends' | 'pending_out' | 'pending_in'>
  >({});

  const [notifOpen, setNotifOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [convos, setConvos] = useState<ConvoRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const msgBtnRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    getMyFriendshipMap()
      .then(setFriendMap)
      .catch(() => setFriendMap({}));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      Promise.all([searchPlayers(q), getMyFriendshipMap()])
        .then(([rows, map]) => {
          if (!cancelled) {
            setResults(rows);
            setFriendMap(map);
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const inPopover =
        t instanceof Element && Boolean(t.closest('[data-hub-popover]'));
      if (!searchRef.current?.contains(t)) setSearchOpen(false);
      if (!inPopover && !notifRef.current?.contains(t)) setNotifOpen(false);
      if (!inPopover && !msgRef.current?.contains(t)) setMsgOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const loadNotifs = () => {
    setNotifLoading(true);
    getNotifications()
      .then((rows) => setNotifs(rows.slice(0, 8) as NotifRow[]))
      .catch(() => setNotifs([]))
      .finally(() => setNotifLoading(false));
  };

  const loadConvos = () => {
    setMsgLoading(true);
    getConversations()
      .then((rows) => setConvos(rows.slice(0, 8) as ConvoRow[]))
      .catch(() => setConvos([]))
      .finally(() => setMsgLoading(false));
  };

  const toggleNotifPanel = () => {
    const next = !notifOpen;
    setMsgOpen(false);
    setNotifOpen(next);
    if (next) loadNotifs();
  };

  const toggleMsgPanel = () => {
    const next = !msgOpen;
    setNotifOpen(false);
    setMsgOpen(next);
    if (next) loadConvos();
  };

  const iconBtn =
    'relative h-10 w-10 rounded-lg text-slate-300 hover:text-primary hover:bg-primary/15 transition-all';

  return (
    <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end flex-wrap">
      <div ref={searchRef} className="relative w-full sm:w-56 md:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search players..."
          className="pl-9 h-10 bg-slate-900/50 border-slate-700/40 text-sm"
        />
        {searchOpen && query.trim().length > 0 && (
          <div className="absolute top-full mt-2 left-0 right-0 z-50 rounded-lg border border-slate-700/40 bg-slate-900/95 backdrop-blur-md shadow-xl overflow-hidden">
            {searching ? (
              <p className="px-3 py-3 text-sm text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching...
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400">No players found.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto overscroll-contain py-1">
                {results.map((player) => {
                  const level = getLevelFromXp(player.xpProgress ?? 0);
                  const isSelf = !!currentUserId && player.id === currentUserId;
                  const status = friendMap[player.id];
                  return (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800/70"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        onClick={() => {
                          onOpenProfile(player.id);
                          setSearchOpen(false);
                          setQuery('');
                        }}
                      >
                        <div className="h-8 w-8 shrink-0">
                          <PlayerAvatar
                            src={player.avatarUrl}
                            name={player.username}
                            isVip={player.isVip}
                            frameConfig={player.equippedFrameConfig}
                            className="h-full w-full"
                            crownClassName="h-3.5 w-3.5"
                          />
                        </div>
                        <div className="min-w-0">
                          <NicknameEffectText
                            name={player.username}
                            effect={player.equippedNicknameConfig}
                            className="text-sm font-semibold truncate block"
                          />
                          <p className="text-[11px] text-slate-400 truncate">
                            {player.role} · Lv {level}
                          </p>
                        </div>
                      </button>
                      {isSelf ? (
                        <span className="text-[10px] text-primary shrink-0 px-1">You</span>
                      ) : status === 'friends' ? (
                        <span className="text-[10px] text-slate-400 shrink-0 px-1">Friends</span>
                      ) : status === 'pending_out' || status === 'pending_in' ? (
                        <span className="text-[10px] text-slate-400 shrink-0 px-1">Pending</span>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          disabled={addingId === player.id}
                          title="Add friend"
                          onClick={async () => {
                            setAddingId(player.id);
                            try {
                              const result = await sendFriendRequest(player.id);
                              if (result.status === 'accepted') {
                                setFriendMap((prev) => ({ ...prev, [player.id]: 'friends' }));
                                toast({ title: 'Already friends' });
                              } else {
                                setFriendMap((prev) => ({
                                  ...prev,
                                  [player.id]: 'pending_out',
                                }));
                                toast({ title: 'Friend request sent' });
                              }
                            } catch {
                              toast({
                                title: 'Could not send request',
                                variant: 'destructive',
                              });
                            } finally {
                              setAddingId(null);
                            }
                          }}
                        >
                          {addingId === player.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconBtn}
            onClick={onOpenFriends}
            aria-label="Friends"
          >
            <Users className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Friends</TooltipContent>
      </Tooltip>

      <div ref={notifRef} className="relative">
        <Button
          ref={notifBtnRef}
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={toggleNotifPanel}
          aria-label="Notifications"
          aria-expanded={notifOpen}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
        <SlidePanel open={notifOpen} anchorRef={notifBtnRef}>
          <div className="px-3 py-2.5 border-b border-slate-700/40 flex items-center justify-between">
            <p className="text-sm font-bold">Notifications</p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setNotifOpen(false);
                onOpenNotifications();
              }}
            >
              Open all
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {notifLoading ? (
              <p className="px-3 py-6 text-sm text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </p>
            ) : notifs.length === 0 ? (
              <p className="px-3 py-6 text-sm text-slate-400 text-center">No notifications.</p>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-primary/10 border-b border-slate-800/80 last:border-0 transition-colors',
                    !n.isRead && 'bg-slate-800/40'
                  )}
                  onClick={() => {
                    setNotifOpen(false);
                    onOpenNotifications();
                  }}
                >
                  <p className="text-sm font-semibold truncate">{n.title}</p>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </button>
              ))
            )}
          </div>
        </SlidePanel>
      </div>

      <div ref={msgRef} className="relative">
        <Button
          ref={msgBtnRef}
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={toggleMsgPanel}
          aria-label="Messages"
          aria-expanded={msgOpen}
        >
          <Mail className="w-5 h-5" />
          {unreadMessages > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
        </Button>
        <SlidePanel open={msgOpen} anchorRef={msgBtnRef}>
          <div className="px-3 py-2.5 border-b border-slate-700/40 flex items-center justify-between">
            <p className="text-sm font-bold">Messages</p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setMsgOpen(false);
                onOpenMessages();
              }}
            >
              Open inbox
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {msgLoading ? (
              <p className="px-3 py-6 text-sm text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </p>
            ) : convos.length === 0 ? (
              <p className="px-3 py-6 text-sm text-slate-400 text-center">No messages yet.</p>
            ) : (
              convos.map((c) => (
                <button
                  key={c.peer.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-primary/10 border-b border-slate-800/80 last:border-0 transition-colors flex gap-2 items-start"
                  onClick={() => {
                    sessionStorage.setItem('kilrun.messagePeerId', c.peer.id);
                    setMsgOpen(false);
                    onOpenMessages();
                  }}
                >
                  <div className="h-8 w-8 shrink-0">
                    <PlayerAvatar
                      src={c.peer.avatarUrl}
                      name={c.peer.username}
                      isVip={c.peer.isVip}
                      frameConfig={c.peer.equippedFrameConfig}
                      className="h-full w-full"
                      crownClassName="h-3.5 w-3.5"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <NicknameEffectText
                        name={c.peer.username}
                        effect={c.peer.equippedNicknameConfig}
                        className="text-sm font-semibold truncate"
                      />
                      {c.unread > 0 && (
                        <span className="text-[10px] font-bold text-primary shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{c.lastMessage}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </SlidePanel>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${iconBtn} hover:text-destructive hover:bg-destructive/15`}
            onClick={onLogout}
            aria-label="Log out"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Log out</TooltipContent>
      </Tooltip>
    </div>
  );
}
