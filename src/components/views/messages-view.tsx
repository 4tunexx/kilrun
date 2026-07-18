'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getConversations,
  getThreadWith,
  getUserBrief,
  sendDirectMessage,
} from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';
import { UserHoverCard } from '@/components/user-hover-card';
import { getRoleTextColorClass } from '@/lib/role-colors';

type Conversation = {
  peer: { id: string; username: string; avatarUrl: string; role?: string; isVip?: boolean };
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
  } | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
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
                    <Avatar>
                      <AvatarImage src={c.peer.avatarUrl} />
                      <AvatarFallback>{c.peer.username.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p
                          className={`font-semibold truncate ${getRoleTextColorClass(
                            c.peer.role,
                            c.peer.isVip
                          )}`}
                        >
                          {c.peer.username}
                        </p>
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
                <Avatar className="h-8 w-8">
                  <AvatarImage src={activePeer.avatarUrl} />
                  <AvatarFallback>{activePeer.username.charAt(0)}</AvatarFallback>
                </Avatar>
                <UserHoverCard
                  userId={activePeer.id}
                  role={activePeer.role}
                  isVip={activePeer.isVip}
                >
                  {activePeer.username}
                </UserHoverCard>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {thread.map((m) => {
                    const mine = m.senderId === userId;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          {m.body}
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
                  placeholder="Type a message..."
                  className="bg-slate-800 border-slate-700"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend();
                  }}
                />
                <Button onClick={handleSend} size="icon" className="shrink-0">
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
