'use client';

import { useEffect, useState } from 'react';
import { Loader2, Package, ShoppingBag, Trophy, Target } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { adminGetUserDetail } from '@/lib/social-actions';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { getLevelFromXp } from '@/lib/progression';

type Detail = Awaited<ReturnType<typeof adminGetUserDetail>>;

export function AdminUserDetailSheet({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    adminGetUserDetail(userId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const u = detail?.user;
  const level = u ? getLevelFromXp(u.xpProgress) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-slate-900/95 border-l border-slate-700/40 text-white overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Player details</SheetTitle>
        </SheetHeader>

        {loading || !u ? (
          <div className="py-16 flex justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarImage src={u.avatarUrl} />
                <AvatarFallback>{u.username.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p
                  className={`text-lg font-bold truncate ${getRoleTextColorClass(
                    u.role,
                    u.isVip
                  )}`}
                >
                  {u.username}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  Lv {level} · {u.currentRank} · {u.vpCurrency} VP · {u.xpProgress}{' '}
                  XP
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {u.role}
                  </Badge>
                  {u.isVip && (
                    <Badge className="bg-orange-500 text-black text-[10px]">VIP</Badge>
                  )}
                  {u.isMuted && (
                    <Badge variant="outline" className="text-amber-400 text-[10px]">
                      Muted
                    </Badge>
                  )}
                  {u.isBanned && (
                    <Badge variant="destructive" className="text-[10px]">
                      Banned
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Tabs defaultValue="inventory">
              <TabsList className="w-full flex flex-wrap h-auto gap-1">
                <TabsTrigger value="inventory" className="text-xs">
                  Inventory
                </TabsTrigger>
                <TabsTrigger value="purchases" className="text-xs">
                  Purchases
                </TabsTrigger>
                <TabsTrigger value="awards" className="text-xs">
                  Awards
                </TabsTrigger>
                <TabsTrigger value="missions" className="text-xs">
                  Missions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="inventory" className="mt-3 space-y-2">
                {(detail?.inventory.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No inventory items.
                  </p>
                ) : (
                  detail!.inventory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-md border border-slate-700/40 bg-slate-800/40 px-3 py-2"
                    >
                      <Package className="h-4 w-4 text-slate-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {item.itemName}
                          {item.isEquipped && (
                            <Badge className="ml-1 h-4 text-[9px]">Equipped</Badge>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {item.itemCategory}
                          {item.cosmeticSlot ? ` · ${item.cosmeticSlot}` : ''} ·{' '}
                          {item.vpValue} VP
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="purchases" className="mt-3 space-y-2">
                {(detail?.purchases.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No purchases.
                  </p>
                ) : (
                  detail!.purchases.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-md border border-slate-700/40 bg-slate-800/40 px-3 py-2"
                    >
                      <ShoppingBag className="h-4 w-4 text-slate-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.itemName}</p>
                        <p className="text-[11px] text-slate-500">
                          {p.vpSpent} VP · {p.itemSku}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="awards" className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5" /> Badges
                  </p>
                  {(detail?.badges.length ?? 0) === 0 ? (
                    <p className="text-sm text-slate-500">None</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {detail!.badges.map((b) => (
                        <Badge key={b.id} variant="outline">
                          {b.badge.title}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">
                    Achievements
                  </p>
                  {(detail?.achievements.length ?? 0) === 0 ? (
                    <p className="text-sm text-slate-500">None</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {detail!.achievements.map((a) => (
                        <li key={a.id} className="text-slate-300">
                          {a.achievement.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="missions" className="mt-3 space-y-2">
                {(detail?.missions.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No missions.
                  </p>
                ) : (
                  detail!.missions.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-md border border-slate-700/40 bg-slate-800/40 px-3 py-2"
                    >
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Target className="h-3.5 w-3.5 text-slate-500" />
                        {m.title}
                        {m.isCompleted && (
                          <Badge className="ml-1 h-4 text-[9px] bg-emerald-600">
                            Done
                          </Badge>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {m.currentCount}/{m.targetCount} · +{m.rewardXp} XP ·{' '}
                        {m.category || m.metric}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
