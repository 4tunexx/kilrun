'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { NicknameEffectText } from '@/components/nickname-effect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  deleteConversation,
  deleteMessage,
  getConversations,
  getThreadWith,
  getUserBrief,
  sendDirectMessage,
} from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';
import { UserHoverCard } from '@/components/user-hover-card';
import { getRoleTextColorClass } from '@/lib/role-colors';

type Conversation = {
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
  createdAt: Date;
  unread: number;
};

type ThreadMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: Date;
};

export default function MessagesView({ userId }: { userId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [deepLinkPeer, setDeepLinkPeer] = useState<{
    id: string;
    username: string;
    avatarUrl: string;
    role?: string;
    isVip?: boolean;
    equippedFrameConfig?: unknown | null;
    equippedNicknameConfig?: unknown | null;
  } | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const reloadConversations = async () => {
    const data = await getConversations();
    setConversations(data as Conversation[]);
    setLoading(false);
  };

  useEffect(() => {
    const deepLink = sessionStorage.getItem('kilrun.messagePeerId');
    if (deepLink) {
      sessionStorage.removeItem('kilrun.messagePeerId');
      setActivePeerId(deepLink);
      getUserBrief(deepLink)
        .then((u) => {
          if (u) setDeepLinkPeer(u);
        })
        .catch(() => {});
    }
    reloadConversations().catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activePeerId) {
      setThread([]);
      return;
    }
    getThreadWith(activePeerId)
      .then((msgs) => setThread(msgs as ThreadMessage[]))
      .catch(() => setThread([]));
  }, [activePeerId]);

  const activePeer =
    conversations.find((c) => c.peer.id === activePeerId)?.peer ??
    (deepLinkPeer && deepLinkPeer.id === activePeerId ? deepLinkPeer : null);

  const handleSend = async () => {
    if (!activePeerId || !draft.trim()) return;
    try {
      await sendDirectMessage(activePeerId, draft);
      setDraft('');
      const msgs = await getThreadWith(activePeerId);
      setThread(msgs as ThreadMessage[]);
      await reloadConversations();
    } catch {
      toast({ title: 'Failed to send', variant: 'destructive' });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      setThread((prev) => prev.filter((m) => m.id !== messageId));
      await reloadConversations();
    } catch {
      toast({ title: 'Could not delete message', variant: 'destructive' });
    }
  };

  const handleDeleteConversation = async () => {
    if (!activePeerId) return;
    setBusy(true);
    try {
      await deleteConversation(activePeerId);
      setActivePeerId(null);
      setThread([]);
      await reloadConversations();
      toast({ title: 'Conversation deleted' });
    } catch {
      toast({ title: 'Could not delete conversation', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6 h-[calc(100vh-1rem)] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 md:gap-4 border border-slate-700/40 rounded-xl overflow-hidden bg-slate-900/40">
        <div
          className={`md:w-80 border-b md:border-b-0 md:border-r border-slate-700/40 ${
            activePeerId ? 'hidden md:flex' : 'flex'
          } flex-col min-h-[40%] md:min-h-0`}
        >
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="p-6 text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                </div>
              ) : conversations.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">
                  No conversations yet. Message someone from Friends or Leaderboard.
                </p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.peer.id}
                    onClick={() => setActivePeerId(c.peer.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-slate-800/60 ${
                      activePeerId === c.peer.id ? 'bg-slate-800/80' : ''
                    }`}
                  >
                    <div className="h-10 w-10 shrink-0">
                      <PlayerAvatar
                        src={c.peer.avatarUrl}
                        name={c.peer.username}
                        isVip={c.peer.isVip}
                        frameConfig={c.peer.equippedFrameConfig}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <NicknameEffectText
                          name={c.peer.username}
                          effect={c.peer.equippedNicknameConfig}
                          className={`font-semibold truncate ${
                            !c.peer.equippedNicknameConfig
                              ? getRoleTextColorClass(c.peer.role, c.peer.isVip)
                              : ''
                          }`}
                        />
                        {c.unread > 0 && (
                          <span className="text-xs bg-primary px-1.5 rounded-full">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{c.lastMessage}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div
          className={`flex-1 flex flex-col min-h-0 ${
            !activePeerId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {activePeer ? (
            <>
              <div className="p-3 border-b border-slate-700/40 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  onClick={() => setActivePeerId(null)}
                >
                  Back
                </Button>
                <div className="h-8 w-8 shrink-0">
                  <PlayerAvatar
                    src={activePeer.avatarUrl}
                    name={activePeer.username}
                    isVip={activePeer.isVip}
                    frameConfig={activePeer.equippedFrameConfig}
                    className="h-full w-full"
                  />
                </div>
                <UserHoverCard
                  userId={activePeer.id}
                  role={activePeer.role}
                  isVip={activePeer.isVip}
                  nicknameEffect={activePeer.equippedNicknameConfig}
                  className="flex-1 truncate"
                >
                  {activePeer.username}
                </UserHoverCard>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-red-400 shrink-0"
                  disabled={busy}
                  onClick={handleDeleteConversation}
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-5 pb-2">
                  {thread.map((m) => {
                    const mine = m.senderId === userId;
                    return (
                      <div
                        key={m.id}
                        className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="max-w-[85%]">
                          <div
                            className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                              mine
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-slate-800 text-slate-100'
                            }`}
                          >
                            {m.body}
                          </div>
                          <div
                            className={`mt-1 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                              mine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <button
                              type="button"
                              className="text-[10px] text-slate-400 hover:text-red-400 flex items-center gap-0.5"
                              onClick={() => handleDeleteMessage(m.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="p-3 border-t border-slate-700/40 flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a reply..."
                  className="bg-slate-800 border-slate-700"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend();
                  }}
                />
                <Button onClick={handleSend} size="icon" className="shrink-0" title="Send reply">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 p-6 text-center">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
