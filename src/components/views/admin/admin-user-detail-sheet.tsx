'use client';

import { useEffect, useState } from 'react';
import { Loader2, Package, ShoppingBag, Trophy, Target, Sparkles, Gift } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminGetUserDetail } from '@/lib/social-actions';
import {
  adminGrantGameXp,
  adminAdjustGameSkillPoints,
  adminResetGameAbilities,
} from '@/lib/game-progression-actions';
import {
  adminListCases,
  adminGrantCaseToUser,
  adminListUserCaseGrants,
} from '@/lib/admin-case-actions';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { getLevelFromXp } from '@/lib/progression';
import { getGameLevelProgress, parseAbilityLevels } from '@shared/ability-progression';
import { useToast } from '@/hooks/use-toast';

type CaseOption = Awaited<ReturnType<typeof adminListCases>>[number];
type CaseGrant = Awaited<ReturnType<typeof adminListUserCaseGrants>>[number];

type Detail = Awaited<ReturnType<typeof adminGetUserDetail>>;

export function AdminUserDetailSheet({
  userId,
  open,
  onOpenChange,
  isAdmin = false,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** These actions (game XP/skill points, respec, crate grants) are gated
   *  `admin`-only server-side (requireAdmin / requireAdminStaff) — the sheet
   *  is also reachable by moderators (Users tab is in MODERATOR_TABS), so
   *  hide the controls entirely for them instead of showing a button that
   *  always fails with "Admin only". */
  isAdmin?: boolean;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { toast } = useToast();

  const [caseOptions, setCaseOptions] = useState<CaseOption[]>([]);
  const [caseGrants, setCaseGrants] = useState<CaseGrant[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [awarding, setAwarding] = useState(false);

  const reloadDetail = () => {
    if (!userId) return Promise.resolve();
    return adminGetUserDetail(userId)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null));
  };

  const reloadCaseGrants = () => {
    if (!userId) return Promise.resolve();
    return adminListUserCaseGrants(userId)
      .then((g) => setCaseGrants(g))
      .catch(() => setCaseGrants([]));
  };

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([adminGetUserDetail(userId), adminListCases(), adminListUserCaseGrants(userId)])
      .then(([d, cases, grants]) => {
        if (cancelled) return;
        setDetail(d);
        setCaseOptions(cases.filter((c) => c.isActive));
        setCaseGrants(grants);
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

  const awardCrate = async () => {
    if (!userId || !selectedCaseId) return;
    setAwarding(true);
    try {
      await adminGrantCaseToUser(userId, selectedCaseId);
      toast({ title: 'Crate awarded' });
      await reloadCaseGrants();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Could not award crate',
        variant: 'destructive',
      });
    } finally {
      setAwarding(false);
    }
  };

  const u = detail?.user;
  const level = u ? getLevelFromXp(u.xpProgress) : 0;
  const gameUser = u as (typeof u & {
    gameXp?: number;
    gameSkillPoints?: number;
    gameAbilities?: unknown;
  }) | undefined;
  const gameProgress = gameUser ? getGameLevelProgress(gameUser.gameXp ?? 0) : null;
  const abilityLevels = gameUser ? parseAbilityLevels(gameUser.gameAbilities) : null;
  const abilitiesLeveled = abilityLevels
    ? Object.values(abilityLevels).filter((lvl) => (lvl ?? 0) > 0).length
    : 0;

  const runGameAction = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key);
    try {
      await action();
      await reloadDetail();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setBusyKey(null);
    }
  };

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
                <TabsTrigger value="game" className="text-xs">
                  Game
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
                {isAdmin && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-950/10 p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                      <Gift className="h-3.5 w-3.5" /> Award a crate
                    </p>
                    <div className="flex gap-2">
                      <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                        <SelectTrigger className="bg-slate-900/50 border-slate-700 text-xs h-8">
                          <SelectValue placeholder="Choose a case…" />
                        </SelectTrigger>
                        <SelectContent>
                          {caseOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={!selectedCaseId || awarding}
                        onClick={() => void awardCrate()}
                      >
                        {awarding && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                        Award
                      </Button>
                    </div>
                    {caseGrants.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                          Recent crates (unopened, in their inventory)
                        </p>
                        {caseGrants.slice(0, 5).map((g) => (
                          <div
                            key={g.id}
                            className="flex items-center justify-between text-[11px] text-slate-400"
                          >
                            <span className="truncate">{g.caseName}</span>
                            <Badge
                              variant="outline"
                              className="text-[9px] ml-2 shrink-0 text-amber-400 capitalize"
                            >
                              {g.source.replace('_', ' ')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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

              <TabsContent value="game" className="mt-3 space-y-3">
                {gameUser && gameProgress ? (
                  <>
                    <div className="rounded-md border border-slate-700/40 bg-slate-800/40 px-3 py-2 space-y-1">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                        In-game level {gameProgress.level}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {gameUser.gameXp ?? 0} game XP · {gameUser.gameSkillPoints ?? 0} unspent
                        Skill Points · {abilitiesLeveled} power(s) leveled
                      </p>
                      <p className="text-[10px] text-slate-600">
                        Separate from the website account level/XP shown above.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!isAdmin && (
                        <p className="text-[11px] text-slate-500 w-full">
                          Game XP / Skill Point / respec controls are admin-only.
                        </p>
                      )}
                      {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyKey === 'grant-xp'}
                        onClick={() => {
                          const raw = window.prompt('Grant in-game XP (negative to remove):', '500');
                          const amount = Number(raw);
                          if (!raw || !Number.isFinite(amount) || amount === 0) return;
                          void runGameAction('grant-xp', () =>
                            adminGrantGameXp(userId!, Math.trunc(amount))
                          );
                        }}
                      >
                        {busyKey === 'grant-xp' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        )}
                        Grant/remove game XP
                      </Button>
                      )}
                      {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyKey === 'grant-sp'}
                        onClick={() => {
                          const raw = window.prompt(
                            'Grant Skill Points (negative to remove):',
                            '1'
                          );
                          const amount = Number(raw);
                          if (!raw || !Number.isFinite(amount) || amount === 0) return;
                          void runGameAction('grant-sp', () =>
                            adminAdjustGameSkillPoints(userId!, Math.trunc(amount))
                          );
                        }}
                      >
                        {busyKey === 'grant-sp' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        )}
                        Grant/remove Skill Points
                      </Button>
                      )}
                      {isAdmin && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyKey === 'reset-abilities'}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Reset every power/ability level for this player and refund their full Skill Point pool?'
                            )
                          ) {
                            return;
                          }
                          void runGameAction('reset-abilities', () =>
                            adminResetGameAbilities(userId!)
                          );
                        }}
                      >
                        {busyKey === 'reset-abilities' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        )}
                        Respec (reset abilities)
                      </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No in-game progression data.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
