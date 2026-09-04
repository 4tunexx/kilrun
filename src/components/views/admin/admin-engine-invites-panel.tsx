'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Link2, Loader2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  createEngineInviteLink,
  listEngineInviteLinks,
  revokeEngineInviteLink,
  type EngineInviteListItem,
} from '@/lib/engine/engine-invite-actions';
import { useToast } from '@/hooks/use-toast';

const STATUS_CLASS: Record<EngineInviteListItem['status'], string> = {
  active: 'border-emerald-500/40 text-emerald-300',
  expired: 'border-slate-500/40 text-slate-400',
  revoked: 'border-red-500/40 text-red-300',
};

export function AdminEngineInvitesPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<EngineInviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = async () => {
    const next = await listEngineInviteLinks();
    setRows(next);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await listEngineInviteLinks();
        if (!cancelled) setRows(next);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load invites',
            description: err instanceof Error ? err.message : 'Admin only',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const generate = async () => {
    setBusy('create');
    try {
      const row = await createEngineInviteLink({ origin: window.location.origin });
      setRows((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
      await navigator.clipboard.writeText(row.url).catch(() => undefined);
      setCopiedId(row.id);
      toast({
        title: '24-hour invite created',
        description: 'Link copied. Send it privately — it expires in 24 hours.',
      });
    } catch (err) {
      toast({
        title: 'Could not create invite',
        description: err instanceof Error ? err.message : 'Admin only',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const copy = async (row: EngineInviteListItem) => {
    try {
      await navigator.clipboard.writeText(row.url);
      setCopiedId(row.id);
      toast({ title: 'Invite link copied' });
    } catch {
      toast({ title: 'Copy failed — select the link and copy it', variant: 'destructive' });
    }
  };

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await revokeEngineInviteLink(id);
      await refresh();
      toast({ title: 'Invite revoked' });
    } catch (err) {
      toast({
        title: 'Could not revoke invite',
        description: err instanceof Error ? err.message : 'Admin only',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="bg-slate-800/40 border-slate-700/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-red-300" /> Engine invite links
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400">
          <code className="text-slate-300">/engine</code> is locked. Generate a coded link here.
          Each link is stored and stays valid for <strong className="text-slate-200">24 hours</strong>.
          Recipients must sign in with Steam after opening it.
        </p>
        <Button disabled={busy === 'create'} onClick={() => void generate()}>
          {busy === 'create' ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Link2 className="h-4 w-4 mr-1.5" />
          )}
          Generate 24-hour invite
        </Button>

        {loading ? (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading stored invites…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No invite links stored yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-slate-700/40 bg-slate-950/40 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={STATUS_CLASS[row.status]}>
                    {row.status}
                  </Badge>
                  <span className="text-[11px] text-slate-500">
                    {row.createdBy || 'admin'} ·{' '}
                    {row.createdAt
                      ? formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })
                      : 'just now'}
                    {' · '}
                    expires {row.expiresAt ? new Date(row.expiresAt).toLocaleString() : 'in 24h'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-red-100 break-all select-all">{row.url}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    disabled={row.status !== 'active'}
                    onClick={() => void copy(row)}
                  >
                    {copiedId === row.id ? (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {copiedId === row.id ? 'Copied' : 'Copy link'}
                  </Button>
                  {row.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-red-300 hover:text-red-200"
                      disabled={busy === row.id}
                      onClick={() => void revoke(row.id)}
                    >
                      {busy === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
