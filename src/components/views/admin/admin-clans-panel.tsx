'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Crown,
  Loader2,
  RefreshCcw,
  Search,
  Shield,
  ShieldPlus,
  Trash2,
  UserMinus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { useToast } from '@/hooks/use-toast';
import {
  adminDisbandClan,
  adminGetClan,
  adminKickClanMember,
  adminListClans,
  adminRegenerateClanInviteCode,
  adminSetClanOpen,
  adminTransferClanOwnership,
  type AdminClanRow,
} from '@/lib/admin-clan-actions';
import type { ClanDto } from '@/lib/clan-actions';

export function AdminClansPanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminClanRow[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openClanId, setOpenClanId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClanDto | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListClans({ query, page, pageSize: 20 });
      setRows(data.rows);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, okTitle?: string) => {
    setBusy('action');
    try {
      await fn();
      await refresh();
      if (openClanId) setDetail(await adminGetClan(openClanId));
      if (okTitle) toast({ title: okTitle });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleDetail = async (clanId: string) => {
    if (openClanId === clanId) {
      setOpenClanId(null);
      setDetail(null);
      return;
    }
    setOpenClanId(clanId);
    setBusy('detail');
    try {
      setDetail(await adminGetClan(clanId));
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to load clan',
        variant: 'destructive',
      });
      setOpenClanId(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or tag…"
            className="pl-8 bg-slate-900/50 border-slate-700"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading clans…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No clans found.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((c) => (
            <Card key={c.id} className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <PlayerAvatar src={c.imageUrl} name={c.name} className="h-9 w-9" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {c.name} <span className="text-slate-500">[{c.tag}]</span>{' '}
                      {!c.isOpen && (
                        <span className="text-[10px] uppercase text-amber-300/80">Closed</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Owner: {c.ownerUsername} · {c.memberCount} members · {c.totalKp} total KP
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void toggleDetail(c.id)}>
                    {openClanId === c.id ? 'Hide' : 'Manage'}
                  </Button>
                </div>

                {openClanId === c.id && (
                  <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                    {busy === 'detail' || !detail ? (
                      <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busy}
                            onClick={() => {
                              void navigator.clipboard.writeText(detail.inviteCode);
                              toast({ title: 'Invite code copied' });
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1.5" /> {detail.inviteCode}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busy}
                            onClick={() =>
                              void run(
                                () => adminRegenerateClanInviteCode(c.id),
                                'Invite code reset'
                              )
                            }
                          >
                            Reset code
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busy}
                            onClick={() =>
                              void run(
                                () => adminSetClanOpen(c.id, !detail.isOpen),
                                detail.isOpen ? 'Clan closed' : 'Clan opened'
                              )
                            }
                          >
                            {detail.isOpen ? 'Close clan' : 'Open clan'}
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!!busy}
                              onClick={() => {
                                if (
                                  !confirm(
                                    `Disband ${detail.name} [${detail.tag}] permanently? This cannot be undone.`
                                  )
                                )
                                  return;
                                void run(async () => {
                                  await adminDisbandClan(c.id);
                                  setOpenClanId(null);
                                  setDetail(null);
                                }, 'Clan disbanded');
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Disband
                            </Button>
                          )}
                        </div>

                        <div className="space-y-1">
                          {detail.members.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 rounded-lg bg-slate-950/40 border border-slate-800 px-2.5 py-1.5"
                            >
                              <PlayerAvatar src={m.avatarUrl} name={m.username} className="h-6 w-6" />
                              <span className="text-xs flex-1 truncate">
                                {m.username}
                                {m.role === 'owner' && (
                                  <Crown className="inline h-3 w-3 ml-1 text-amber-300" />
                                )}
                                {m.role === 'officer' && (
                                  <ShieldPlus className="inline h-3 w-3 ml-1 text-cyan-300" />
                                )}
                              </span>
                              <span className="text-[10px] text-slate-500">{m.kp} KP</span>
                              {m.role !== 'owner' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-[10px]"
                                  disabled={!!busy}
                                  onClick={() =>
                                    void run(
                                      () => adminTransferClanOwnership(c.id, m.id),
                                      'Ownership transferred'
                                    )
                                  }
                                >
                                  <Shield className="h-3 w-3 mr-1" /> Make owner
                                </Button>
                              )}
                              {m.role !== 'owner' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-rose-400"
                                  disabled={!!busy}
                                  onClick={() =>
                                    void run(
                                      () => adminKickClanMember(c.id, m.id),
                                      'Member removed'
                                    )
                                  }
                                >
                                  <UserMinus className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
