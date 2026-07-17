'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getNotifications, markAllNotificationsRead } from '@/lib/social-actions';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsView() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl font-black flex items-center gap-2">
          <Bell className="w-8 h-8" /> Notifications
        </h1>
        <Button
          variant="outline"
          disabled={markingRead || !hasUnread}
          onClick={async () => {
            setMarkingRead(true);
            try {
              await markAllNotificationsRead();
              await reload();
            } finally {
              setMarkingRead(false);
            }
          }}
        >
          {markingRead ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="mr-2 h-4 w-4" />
          )}
          Mark all read
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
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-slate-300">{n.body}</p>
                </div>
                <p className="text-xs text-slate-500 shrink-0">
                  {formatDistanceToNow(new Date(n.createdAt))} ago
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
