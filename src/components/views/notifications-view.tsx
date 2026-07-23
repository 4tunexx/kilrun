'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  deleteAllNotifications,
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/social-actions';
import { acceptPartyInvite } from '@/lib/party-actions';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

function extractPartyCode(body: string): string | null {
  const m = body.match(/\bparty\s+([A-Z0-9]{4,8})\b/i);
  return m?.[1]?.toUpperCase() ?? null;
}

export default function NotificationsView() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  const reload = async () => {
    const data = await getNotifications();
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  const hasUnread = items.some((n) => !n.isRead);

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy || !hasUnread}
          onClick={async () => {
            setBusy('read-all');
            try {
              await markAllNotificationsRead();
              await reload();
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'read-all' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="mr-2 h-4 w-4" />
          )}
          Mark all read
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-red-400 hover:text-red-300"
          disabled={!!busy || items.length === 0}
          onClick={async () => {
            setBusy('delete-all');
            try {
              await deleteAllNotifications();
              await reload();
              toast({ title: 'Notifications cleared' });
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'delete-all' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete all
        </Button>
      </div>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <p className="text-slate-400 text-center py-12">You&apos;re all caught up.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card
              key={n.id}
              className={`border-slate-700/30 ${
                n.isRead ? 'bg-slate-800/20' : 'bg-slate-800/50'
              }`}
            >
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{n.body}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt))} ago
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {n.type === 'party_invite' && extractPartyCode(n.body || '') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy === n.id}
                      onClick={async () => {
                        const code = extractPartyCode(n.body || '');
                        if (!code) return;
                        setBusy(n.id);
                        try {
                          await acceptPartyInvite(code);
                          await markNotificationRead(n.id);
                          setItems((prev) =>
                            prev.map((x) =>
                              x.id === n.id ? { ...x, isRead: true } : x
                            )
                          );
                          toast({
                            title: 'Joined party',
                            description: `You’re in party ${code}. Open Play to queue.`,
                          });
                        } catch (e: unknown) {
                          toast({
                            title:
                              e instanceof Error
                                ? e.message
                                : 'Could not join party',
                            variant: 'destructive',
                          });
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      Accept
                    </Button>
                  )}
                  {!n.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === n.id}
                      title="Mark read"
                      onClick={async () => {
                        setBusy(n.id);
                        try {
                          await markNotificationRead(n.id);
                          setItems((prev) =>
                            prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
                          );
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300"
                    disabled={busy === n.id}
                    title="Delete"
                    onClick={async () => {
                      setBusy(n.id);
                      try {
                        await deleteNotification(n.id);
                        setItems((prev) => prev.filter((x) => x.id !== n.id));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
