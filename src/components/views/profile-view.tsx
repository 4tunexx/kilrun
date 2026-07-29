import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Save,
  Loader2,
  ShieldCheck,
  Mail,
  Package,
  Sparkles,
  Bell,
  ShoppingBag,
  MessageSquare,
  Coins,
  Zap,
  MailX,
  Swords,
  Trophy,
import type { MatchStat, User as UserModel } from '@/generated/prisma';
import { BannerFill } from '@/components/banner-fill';
import { normalizeBannerConfig } from '@/lib/banner';
import {
  ProfileHeroBanner,
} from '@/components/profile-hero-banner';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { ShowcaseEditor } from '@/components/views/profile/showcase-editor';
import { GameProgressionCard } from '@/components/game-progression-card';
import { useToast } from '@/hooks/use-toast';
import { EmailVerificationForm } from '@/components/email-verification-form';
import { COUNTRIES, flagUrl, getCountryName } from '@/lib/countries';

type InventoryRow = Awaited<ReturnType<typeof getMyInventory>>[number];
type ProfileActivity = Awaited<ReturnType<typeof getMyProfileActivity>>;

export default function ProfileView({ userId }: { userId: string }) {
  const [user, setUser] = useState<UserModel | null>(null);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [ranked, setRanked] = useState<RankedStatsSummary | null>(null);
  const [showInGameProgression, setShowInGameProgression] = useState(false);
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';

  const reloadCosmetics = () => {
    Promise.all([getSessionUser(), getMyInventory()]).then(([u, inv]) => {
      setUser(u);
      setInventory(inv);
    });
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getSessionUser(),
      getStatsSummary(userId),
      getMatchStats(userId, 5),
      getMyInventory(),
      getMyProfileActivity(),
      getMyRankedStats(userId),
      getModeStatsBundle(userId),
    ]).then(([u, s, h, inv, act, rk, modes]) => {
      if (!isMounted) return;
      setUser(u);
      setBio(u?.bio ?? '');
      setStatusMessage(u?.statusMessage ?? '');
      setCountryCode(u?.countryCode ?? '');
      setNotifyPush(u?.notifyPush ?? true);
      setNotifyEmail(u?.notifyEmail ?? true);
      setProfilePrivate(!!(u as { profilePrivate?: boolean } | null)?.profilePrivate);
      setProfileCommentsEnabled(
        (u as { profileCommentsEnabled?: boolean } | null)?.profileCommentsEnabled !== false
      );
      setSummary(s);
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Progression</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInGameProgression(!showInGameProgression)}
              className={`relative w-10 h-10 rounded-full p-0 flex items-center justify-center transition-all ${
                showInGameProgression
                  ? 'bg-orange-500/20 border border-orange-400/50 text-orange-300 hover:bg-orange-500/30'
                  : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
              }`}
              title={showInGameProgression ? 'Show web stats' : 'Show in-game level'}
            >
              <ArrowRightLeft className="w-4 h-4" />
              {!showInGameProgression && (
                <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-pulse" />
              )}
            </Button>
          </div>

          {showInGameProgression ? (
            <GameProgressionCard userId={userId} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                <CardContent className="pt-5 text-center">
                  <Zap className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-black">{user?.xpProgress ?? 0}</p>
                  <p className="text-xs text-slate-400">Total XP</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                <CardContent className="pt-5 text-center">
                  <Coins className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
                  <p className="text-2xl font-black">{user?.vpCurrency ?? 0}</p>
                  <p className="text-xs text-slate-400">VP Balance</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                <CardContent className="pt-5 text-center">
                  <ShoppingBag className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-black">{activity?.totals.purchaseCount ?? 0}</p>
                  <p className="text-xs text-slate-400">Purchases</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                <CardContent className="pt-5 text-center">
                  <MessageSquare className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-black">{activity?.totals.forumPostCount ?? 0}</p>
                  <p className="text-xs text-slate-400">Forum Posts</p>
                </CardContent>
              </Card>
            </div>
          )}


          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
              <CardContent className="pt-5 text-center">
                <p className="text-xs text-slate-400 mb-1">Rank</p>
                <p className="text-xl font-black text-yellow-400">
                  {user?.currentRank || 'Unranked'}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
              <CardContent className="pt-5 text-center space-y-1">
                <p className="text-xs text-slate-400">Email</p>
                {user?.emailVerified ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                    Not verified
                  </span>
                )}
              </CardContent>
            </Card>
            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 sm:col-span-1">
              <CardContent className="pt-5 space-y-1 text-sm">
                <p className="text-xs text-slate-400">Equipped cosmetics</p>
                <p className="text-slate-300 truncate">
                  Banner: {user?.equippedBannerItemName || 'None'}
                </p>
                <p className="text-slate-300 truncate">
                  Frame: {user?.equippedFrameItemName || 'None'}
                </p>
                <p className="text-slate-300 truncate">
                  Nickname: {user?.equippedNicknameItemName || 'None'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>This is how other players see you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="statusMessage">Status message</Label>
                <Input
                  id="statusMessage"
                  value={statusMessage}
                  maxLength={80}
                  onChange={(e) => setStatusMessage(e.target.value.slice(0, 80))}
                  placeholder="A short line under your name…"
                  className="bg-slate-900/50 border-slate-700"
                />
                <p className="text-xs text-slate-500">
                  {statusMessage.length}/80 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell other players about yourself..."
                  className="bg-slate-900/50 border-slate-700 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select
                  value={countryCode || 'none'}
                  onValueChange={(v) => setCountryCode(v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700">
                    <SelectValue placeholder="Choose your country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">No country</SelectItem>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="inline-flex items-center gap-2">
                          <Image
                            src={flagUrl(c.code, 20)}
                            alt=""
                            width={18}
                            height={14}
                            className="rounded-[2px]"
                            unoptimized
                          />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Your flag appears on your public profile next to your name.
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-3">
                <div className="min-w-0">
                  <Label htmlFor="profilePrivate">Private public profile</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Hide your details on your public page. Others only see that the profile is private.
                  </p>
                </div>
                <Switch
                  id="profilePrivate"
                  checked={profilePrivate}
                  onCheckedChange={setProfilePrivate}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-3">
                <div className="min-w-0">
                  <Label htmlFor="profileCommentsEnabled">Allow profile comments</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Let other players leave comments on your public profile.
                  </p>
                </div>
                <Switch
                  id="profileCommentsEnabled"
                  checked={profileCommentsEnabled}
                  onCheckedChange={setProfileCommentsEnabled}
                  disabled={profilePrivate}
                />
              </div>
              <Button disabled={saving} onClick={savePublicProfile}>
                <Save className="mr-2 h-4 w-4" />
                Save Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="mt-0 space-y-4">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Player Statistics</CardTitle>
              <CardDescription>
                Live combat stats from match results — Deathrun, Horde, Competitive &amp; Ranked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="deathrun" className="w-full">
                <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-900/50 p-1 mb-4">
                  <TabsTrigger value="deathrun" className="flex-none">
                    Deathrun
                  </TabsTrigger>
                  <TabsTrigger value="horde" className="flex-none">
                    Horde
                  </TabsTrigger>
                  <TabsTrigger value="competitive" className="flex-none">
                    Competitive
                  </TabsTrigger>
                  <TabsTrigger value="ranked" className="flex-none">
                    Ranked
                  </TabsTrigger>
                  <TabsTrigger value="overall" className="flex-none">
                    Overall
                  </TabsTrigger>
                </TabsList>
                {(
                  [
                    ['deathrun', modeBundle?.deathrun],
                    ['horde', modeBundle?.horde],
                    ['competitive', modeBundle?.competitive],
                    ['ranked', modeBundle?.ranked],
                    ['overall', modeBundle?.overall],
                  ] as const
                ).map(([key, m]) => (
                  <TabsContent key={key} value={key} className="mt-0">
                    <ModeStatsGrid modeKey={key} stats={m} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
          <div>
            <h3 className="text-base font-semibold text-white mb-1">In-Game Powers</h3>
            <p className="text-xs text-slate-400 mb-3">
              In-match level, Skill Points, and power upgrades — earned by playing and spent
              from the in-game menu (press M during a match). Separate from your account level.
            </p>
            <GameProgressionCard userId={userId} />
          </div>
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="text-base">Legacy Deathrun runs</CardTitle>
              <CardDescription>Distance / score from MatchStat telemetry.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center bg-slate-900/40 p-3 rounded-lg">
                <p className="text-2xl font-black text-primary">{summary?.totalRuns ?? 0}</p>
                <p className="text-xs text-slate-400">Total Runs</p>
              </div>
              <div className="text-center bg-slate-900/40 p-3 rounded-lg">
                <p className="text-2xl font-black text-primary">{summary?.bestScore ?? 0}</p>
                <p className="text-xs text-slate-400">Best Score</p>
              </div>
              <div className="text-center bg-slate-900/40 p-3 rounded-lg">
                <p className="text-2xl font-black text-primary">{summary?.bestDistance ?? 0}m</p>
                <p className="text-xs text-slate-400">Best Distance</p>
              </div>
              <div className="text-center bg-slate-900/40 p-3 rounded-lg">
                <p className="text-2xl font-black text-primary">{summary?.avgScore ?? 0}</p>
                <p className="text-xs text-slate-400">Avg Score</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranked" className="mt-0 space-y-4">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Swords className="h-5 w-5 text-amber-300" /> Ranked Competitive
              </CardTitle>
              <CardDescription>
                Killrun Points (KP), peak rank, and Competitive win / loss record.
                {ranked?.isPremium
                  ? ' Premium Ranked is active.'
                  : ' Unlock Premium to play Ranked and move KP.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center bg-slate-900/40 p-4 rounded-lg border border-slate-700/30">
                  <div className="flex items-center justify-center mb-1">
                    <RankLabel
                      rank={ranked?.currentRank || 'Unranked'}
                      imageUrl={ranked?.rankImage}
                      color={ranked?.rankColor}
                      size={22}
                      textClassName="text-xl font-black"
                    />
                  </div>
                  <p className="text-xs text-slate-400">Current rank</p>
                </div>
                <div className="text-center bg-slate-900/40 p-4 rounded-lg border border-slate-700/30">
                  <Trophy className="w-5 h-5 mx-auto mb-1 text-amber-300" />
                  <p className="text-2xl font-black tabular-nums">
                    {(ranked?.kp ?? 1000).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">Live KP</p>
                </div>
                <div className="text-center bg-slate-900/40 p-4 rounded-lg border border-slate-700/30">
                  <RankLabel
                    rank={ranked?.peakRank || 'Unranked'}
                    imageUrl={ranked?.peakRankImage}
                    color={ranked?.peakRankColor}
                    size={18}
                    textClassName="text-xl font-black"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Peak · {(ranked?.peakKp ?? 1000).toLocaleString()} KP
                  </p>
                </div>
                <div className="text-center bg-slate-900/40 p-4 rounded-lg border border-slate-700/30">
                  <p className="text-2xl font-black tabular-nums">
                    {ranked?.matchesPlayed ?? 0}
                  </p>
                  <p className="text-xs text-slate-400">Comp matches</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    Ranked (KP)
                  </p>
                  <p className="text-2xl font-black">
                    <span className="text-emerald-400">{ranked?.rankedWins ?? 0}W</span>
                    <span className="text-slate-600 mx-1">·</span>
                    <span className="text-rose-400">{ranked?.rankedLosses ?? 0}L</span>
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    Casual (no KP)
                  </p>
                  <p className="text-2xl font-black">
                    <span className="text-emerald-400">{ranked?.casualWins ?? 0}W</span>
                    <span className="text-slate-600 mx-1">·</span>
                    <span className="text-rose-400">{ranked?.casualLosses ?? 0}L</span>
                  </p>
                </div>
              </div>
              {user && (
                <p className="text-[11px] text-slate-500">
                  Platform VIP ({user.isVip ? 'active' : 'inactive'}) is separate from Premium
                  Ranked
                  {ranked?.premiumExpiresAt
                    ? ` · Premium until ${new Date(ranked.premiumExpiresAt).toLocaleDateString()}`
                    : ''}
                  .
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-0 space-y-4">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" /> Purchase History
              </CardTitle>
              <CardDescription>
                {activity?.totals.purchaseCount ?? 0} purchases ·{' '}
                {activity?.totals.vpSpent ?? 0} VP spent lifetime
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!activity || activity.purchases.length === 0 ? (
                <p className="text-center py-8 text-slate-400">
                  No purchases yet. Visit the Store to spend VP.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 hover:bg-transparent">
                      <TableHead>Item</TableHead>
                      <TableHead>VP</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.purchases.map((p) => (
                      <TableRow key={p.id} className="border-slate-700/50">
                        <TableCell className="font-semibold">{p.itemName}</TableCell>
                        <TableCell className="text-yellow-400">{p.vpSpent}</TableCell>
                        <TableCell className="text-right text-slate-400">
                          {formatDistanceToNow(new Date(p.createdAt))} ago
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" /> Forum Posts
              </CardTitle>
              <CardDescription>Your recent community posts.</CardDescription>
            </CardHeader>
            <CardContent>
              {!activity || activity.forumPosts.length === 0 ? (
                <p className="text-center py-8 text-slate-400">
                  You haven&apos;t posted on the forum yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activity.forumPosts.map((post) => (
                    <li
                      key={post.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{post.title}</p>
                        <p className="text-xs text-slate-400 capitalize">{post.category}</p>
                      </div>
                      <p className="text-xs text-slate-500 shrink-0">
                        {formatDistanceToNow(new Date(post.createdAt))} ago
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="match-history" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Match History</CardTitle>
              <CardDescription>
                Last {modeBundle?.history?.length ?? 0} matches across all modes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading match history...
                </div>
              ) : !modeBundle?.history?.length ? (
                <p className="text-center py-12 text-slate-400">
                  No matches recorded yet. Play Deathrun, Horde, or Competitive to build history.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 hover:bg-transparent">
                      <TableHead>Mode</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>K/D</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modeBundle.history.map((match: MatchHistoryRow) => (
                      <TableRow key={match.id} className="border-slate-700/50">
                        <TableCell className="font-bold capitalize">
                          {match.mode.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="capitalize">{match.outcome}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {match.kills}/{match.deaths}
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">{match.detail}</TableCell>
                        <TableCell className="text-right text-slate-400">
                          {formatDistanceToNow(new Date(match.playedAt))} ago
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="showcase" className="mt-0">
          <ShowcaseEditor />
        </TabsContent>

        <TabsContent value="cosmetics" className="mt-0 space-y-4">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Profile Banner
              </CardTitle>
              <CardDescription>
                Equip a banner cosmetic to customize your profile header. Buy more from the
                Store.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-20 sm:h-28 w-full rounded-lg border border-slate-700/50 overflow-hidden relative">
                <BannerFill
                  banner={equippedBanner}
                  showProfileOverlay
                  className="absolute inset-0"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  {user?.equippedBannerItemName
                    ? `Equipped: ${user.equippedBannerItemName}`
                    : 'No banner equipped'}
                </p>
                {user?.equippedBannerItemName && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cosmeticBusyId === 'banner'}
                    onClick={() => handleUnequipSlot('banner', 'Banner')}
                  >
                    Unequip
                  </Button>
                )}
              </div>

              {banners.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  You don&apos;t own any banners yet. Check the Store for cosmetics.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {banners.map((item) => {
                    const cfg = item.bannerConfig ? normalizeBannerConfig(item.bannerConfig) : null;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg border overflow-hidden ${
                          item.isEquipped ? 'border-primary ring-2 ring-primary' : 'border-slate-700/50'
                        }`}
                      >
                        <BannerFill banner={cfg} className="h-12 w-full" />
                        <div className="p-2 bg-slate-900/40 space-y-1">
                          <p className="text-xs font-semibold truncate flex items-center gap-1">
                            {item.itemName}
                            {item.isEquipped && (
                              <Badge className="bg-primary text-[9px] h-4">On</Badge>
                            )}
                          </p>
                          {!item.isEquipped && (
                            <Button
                              size="sm"
                              className="h-6 w-full text-[11px]"
                              disabled={cosmeticBusyId === item.id}
                              onClick={() => handleEquipCosmetic(item)}
                            >
                              Equip
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Avatar frames
              </CardTitle>
              <CardDescription>
                Equip a frame around your profile avatar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  {user?.equippedFrameItemName
                    ? `Equipped: ${user.equippedFrameItemName}`
                    : 'No frame equipped'}
                </p>
                {user?.equippedFrameItemName && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cosmeticBusyId === 'frame'}
                    onClick={() => handleUnequipSlot('frame', 'Frame')}
                  >
                    Unequip
                  </Button>
                )}
              </div>
              {frames.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  You don&apos;t own any frames yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {frames.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 bg-slate-900/40 space-y-2 ${
                        item.isEquipped
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-slate-700/50'
                      }`}
                    >
                      <AvatarWithFrame
                        src={user?.avatarUrl}
                        alt={user?.username ?? 'Player'}
                        fallback={user?.username?.charAt(0) ?? '?'}
                        frameConfig={item.cosmeticConfig}
                        sizeClass="h-16 w-16"
                      />
                      <p className="text-xs font-semibold truncate flex items-center gap-1">
                        {item.itemName}
                        {item.isEquipped && (
                          <Badge className="bg-primary text-[9px] h-4">On</Badge>
                        )}
                      </p>
                      {!item.isEquipped && (
                        <Button
                          size="sm"
                          className="h-6 w-full text-[11px]"
                          disabled={cosmeticBusyId === item.id}
                          onClick={() => handleEquipCosmetic(item)}
                        >
                          Equip
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Nickname effects
              </CardTitle>
              <CardDescription>
                Equip a visual effect for your display name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  {user?.equippedNicknameItemName
                    ? `Equipped: ${user.equippedNicknameItemName}`
                    : 'No nickname effect equipped'}
                </p>
                {user?.equippedNicknameItemName && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cosmeticBusyId === 'nickname'}
                    onClick={() => handleUnequipSlot('nickname', 'Nickname')}
                  >
                    Unequip
                  </Button>
                )}
              </div>
              {nicknames.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  You don&apos;t own any nickname effects yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {nicknames.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 bg-slate-900/40 space-y-2 ${
                        item.isEquipped
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-slate-700/50'
                      }`}
                    >
                      <NicknameEffectText
                        name={user?.username ?? 'Player'}
                        effect={item.cosmeticConfig}
                        className="text-sm font-bold truncate block"
                      />
                      <p className="text-xs font-semibold truncate flex items-center gap-1">
                        {item.itemName}
                        {item.isEquipped && (
                          <Badge className="bg-primary text-[9px] h-4">On</Badge>
                        )}
                      </p>
                      {!item.isEquipped && (
                        <Button
                          size="sm"
                          className="h-6 w-full text-[11px]"
                          disabled={cosmeticBusyId === item.id}
                          onClick={() => handleEquipCosmetic(item)}
                        >
                          Equip
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardContent className="py-4 flex items-center gap-3 text-sm text-slate-400">
              <Package className="h-5 w-5 text-primary shrink-0" />
              Looking for other owned items? Open the Inventory drawer from the hub rail to
              sort, resell, or discard anything you&apos;ve bought.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 space-y-4">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" /> Notifications
              </CardTitle>
              <CardDescription>
                Choose how Kilrun can reach you about rewards, friends, and updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-3">
                <div>
                  <p className="font-semibold">Push notifications</p>
                  <p className="text-xs text-slate-400">In-hub alerts for badges, missions, and more.</p>
                </div>
                <Switch
                  checked={notifyPush}
                  disabled={prefsSaving}
                  onCheckedChange={(checked) => saveNotificationPrefs({ notifyPush: checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-3">
                <div>
                  <p className="font-semibold">Email notifications</p>
                  <p className="text-xs text-slate-400">
                    Occasional email updates (requires a verified email).
                  </p>
                </div>
                <Switch
                  checked={notifyEmail}
                  disabled={prefsSaving || !user?.emailVerified}
                  onCheckedChange={(checked) => saveNotificationPrefs({ notifyEmail: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Account details from your Steam login.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="username">Steam Username</Label>
                <Input
                  id="username"
                  value={user?.username ?? ''}
                  readOnly
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input
                  value={user?.role ?? 'player'}
                  readOnly
                  className="bg-slate-900/50 border-slate-700 capitalize"
                />
              </div>

              <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email
                  </Label>
                  {user?.emailVerified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Confirmed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                      Not confirmed
                    </span>
                  )}
                </div>

                {user?.emailVerified && !showEmailForm ? (
                  <>
                    <Input
                      value={user.email ?? ''}
                      readOnly
                      className="bg-slate-900/50 border-emerald-500/40 text-emerald-100"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setShowEmailForm(true)}
                      >
                        <Mail className="mr-2 h-4 w-4" /> Change email
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="destructive"
                          className="w-full sm:w-auto"
                          disabled={deactivatingEmail}
                          onClick={() => {
                            if (
                              !window.confirm(
                                'Deactivate email on this account? You can verify the same address again (admin testing).'
                              )
                            ) {
                              return;
                            }
                            setDeactivatingEmail(true);
                            void deactivateOwnEmail()
                              .then((u) => {
                                setUser(u);
                                setShowEmailForm(true);
                                toast({
                                  title: 'Email deactivated',
                                  description:
                                    'Verification cleared. Send a new code to reuse the address.',
                                });
                              })
                              .catch((e: unknown) => {
                                toast({
                                  title:
                                    e instanceof Error
                                      ? e.message
                                      : 'Could not deactivate email',
                                  variant: 'destructive',
                                });
                              })
                              .finally(() => setDeactivatingEmail(false));
                          }}
                        >
                          {deactivatingEmail ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <MailX className="mr-2 h-4 w-4" />
                          )}
                          Deactivate email
                        </Button>
                      )}
                    </div>
                    {isAdmin && (
                      <p className="text-xs text-slate-500">
                        Admin only — clears verification so you can reuse an address
                        (e.g. for Resend testing).
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400">
                      Type your email here and send a verification code.
                    </p>
                    <EmailVerificationForm
                      compact
                      onComplete={() => {
                        setShowEmailForm(false);
                        getSessionUser().then((u) => setUser(u));
                      }}
                    />
                    {user?.emailVerified && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowEmailForm(false)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
      </div>
    </div>
  );
}

function ModeStatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
      <p className="text-2xl font-black tabular-nums text-primary">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

function ModeStatsGrid({
  modeKey,
  stats,
}: {
  modeKey: string;
  stats: ModeStatsSummary | null | undefined;
}) {
  const m = stats;
  if (!m) {
    return (
      <p className="text-center py-8 text-slate-400 text-sm">No matches in this mode yet.</p>
    );
  }
  const cells: Array<{ label: string; value: string | number }> = [
    { label: 'Matches', value: m.matches },
    { label: 'Wins', value: m.wins + (modeKey === 'deathrun' || modeKey === 'horde' ? m.survived : 0) },
    { label: 'Losses', value: m.losses + m.eliminated },
    { label: 'Kills', value: m.kills },
    { label: 'Deaths', value: m.deaths },
    { label: 'K/D', value: m.kd },
  ];
  if (modeKey === 'deathrun') {
    cells.push(
      { label: 'Best score', value: m.bestScore },
      { label: 'Best distance', value: `${m.bestDistance}m` }
    );
  }
  if (modeKey === 'horde') {
    cells.push({ label: 'Waves cleared', value: m.wavesCleared });
  }
  if (modeKey === 'competitive' || modeKey === 'ranked') {
    cells.push(
      { label: 'Rounds won', value: m.roundsWon },
      { label: 'Rounds lost', value: m.roundsLost }
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {cells.map((c) => (
        <ModeStatCell key={c.label} label={c.label} value={c.value} />
      ))}
    </div>
  );
}
