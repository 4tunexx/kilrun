'use client';

import { useEffect, useState } from 'react';
import { Loader2, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { RequirementTypeSelect } from '@/components/views/admin/requirement-type-select';
import { BannerGenerator } from '@/components/views/admin/banner-generator';
import {
  adminCreateGuide,
  adminCreateNews,
  adminDashboardStats,
  adminDeleteStoreItem,
  adminListTickets,
  adminListUsers,
  adminSetBanned,
  adminSetMuted,
  adminSetUserRole,
  adminUpdateTicketStatus,
  adminUpsertStoreItem,
} from '@/lib/social-actions';
import { getStoreItems } from '@/lib/actions';
import { broadcastSiteSettings } from '@/lib/site-branding-events';
import {
  getSiteSettings,
  updateSiteSettings,
  adminAwardXp,
  adminAwardVp,
  adminAwardBadge,
  adminListMissionTemplates,
  adminUpsertMissionTemplate,
  adminListAchievements,
  adminUpsertAchievement,
  adminListBadges,
  adminUpsertBadge,
  adminSeedProgression,
  adminClearGlobalChat,
} from '@/lib/progression-actions';
import { ACCOUNT_ROLES } from '@/lib/roles';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { useToast } from '@/hooks/use-toast';

const MODERATOR_TABS = ['dashboard', 'users', 'moderation', 'support'] as const;
const ADMIN_TABS = [
  'dashboard',
  'site',
  'users',
  'moderation',
  'awards',
  'missions',
  'achievements',
  'badges',
  'support',
  'shop',
  'content',
] as const;

export default function AdminView({ viewerRole }: { viewerRole?: string }) {
  const isAdmin = viewerRole === 'admin';
  const visibleTabs = isAdmin ? ADMIN_TABS : MODERATOR_TABS;

  const [stats, setStats] = useState({
    users: 0,
    openTickets: 0,
    forumPosts: 0,
    purchases: 0,
  });
  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { toast } = useToast();

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Something went wrong', variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const [itemForm, setItemForm] = useState({
    itemName: '',
    itemCategory: 'Cosmetic',
    itemSku: '',
    vpPrice: 100,
    imageUrl: '',
  });
  const [newsForm, setNewsForm] = useState({ title: '', summary: '', body: '' });
  const [guideForm, setGuideForm] = useState({
    title: '',
    summary: '',
    body: '',
    category: 'general',
  });
  const [siteForm, setSiteForm] = useState({
    logoUrl: '',
    headerLogoUrl: '',
    backgroundUrl: '',
    homeHeroImage: '',
    headerTitle: '',
    headerSubtitle: '',
    landingHeroImage: '',
    gameDisabled: false,
    gameDisabledMsg: '',
    chatEnabled: true,
  });
  const [awardForm, setAwardForm] = useState({
    userId: '',
    xp: 100,
    vp: 100,
    badgeKey: '',
  });
  const [missionForm, setMissionForm] = useState({
    key: '',
    title: '',
    description: '',
    rewardXp: 50,
    targetCount: 1,
    metric: 'runs',
    category: 'game',
    iconImageUrl: '',
  });
  const [achForm, setAchForm] = useState({
    key: '',
    title: '',
    description: '',
    category: 'game',
    metric: 'runs',
    targetCount: 1,
    xpReward: 50,
    icon: 'trophy',
    iconImageUrl: '',
  });
  const [badgeForm, setBadgeForm] = useState({
    key: '',
    title: '',
    description: '',
    rarity: 'common',
    icon: 'award',
    metric: 'manual',
    targetCount: 1,
    iconImageUrl: '',
  });

  const reload = async () => {
    if (isAdmin) {
      const [s, u, t, store, settings, m, a, b] = await Promise.all([
        adminDashboardStats(),
        adminListUsers(),
        adminListTickets(),
        getStoreItems(),
        getSiteSettings(),
        adminListMissionTemplates(),
        adminListAchievements(),
        adminListBadges(),
      ]);
      setStats(s);
      setUsers(u);
      setTickets(t);
      setItems(store);
      setMissions(m);
      setAchievements(a);
      setBadges(b);
      setSiteForm({
        logoUrl: settings.logoUrl ?? '',
        headerLogoUrl: settings.headerLogoUrl ?? '',
        backgroundUrl: settings.backgroundUrl ?? '',
        homeHeroImage: settings.homeHeroImage ?? '',
        headerTitle: settings.headerTitle ?? '',
        headerSubtitle: settings.headerSubtitle ?? '',
        landingHeroImage: settings.landingHeroImage ?? '',
        gameDisabled: settings.gameDisabled,
        gameDisabledMsg: settings.gameDisabledMsg ?? '',
        chatEnabled: settings.chatEnabled,
      });
    } else {
      // Moderators get a leaner reload: dashboard counts, users (for mute/ban), and tickets.
      const [s, u, t] = await Promise.all([
        adminDashboardStats(),
        adminListUsers(),
        adminListTickets(),
      ]);
      setStats(s);
      setUsers(u);
      setTickets(t);
    }
    setLoading(false);
  };

  useEffect(() => {
    reload().catch((err) => {
      console.error(err);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-16 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading admin panel...
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-800/60 p-1">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="flex-none capitalize">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Players', stats.users],
              ['Open tickets', stats.openTickets],
              ['Forum posts', stats.forumPosts],
              ['Purchases', stats.purchases],
            ].map(([label, value]) => (
              <Card key={String(label)} className="bg-slate-800/40 border-slate-700/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-black">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {isAdmin && (
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Seed progression (mobile-friendly)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-slate-400">
                  Loads the 20 missions, 20 achievements, badges, shop items, and
                  default site settings into MongoDB. Use this instead of running
                  npm on your phone.
                </p>
                <Button
                  disabled={busyKey === 'seed'}
                  onClick={() =>
                    runAction('seed', async () => {
                      const result = await adminSeedProgression();
                      toast({
                        title: 'Progression seeded',
                        description: `${result.missions} missions · ${result.achievements} achievements · ${result.badges} badges`,
                      });
                      await reload();
                    })
                  }
                >
                  {busyKey === 'seed' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Seed missions / achievements / badges
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="site" className="mt-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Website & landing settings</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <ImageUploadField
                  label="Sidebar / mark logo (K)"
                  value={siteForm.logoUrl}
                  onChange={(v) => setSiteForm((f) => ({ ...f, logoUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                  kind="mark"
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Small mark used in the left rail and footer. Leave empty to use{' '}
                  <code className="text-slate-400">/K2.png</code>.
                </p>
                <ImageUploadField
                  label="Header logo (wordmark)"
                  value={siteForm.headerLogoUrl}
                  onChange={(v) => setSiteForm((f) => ({ ...f, headerLogoUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                  kind="wordmark"
                  widePreview
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Replaces the big Kilrun word on the home hero and landing. Leave empty
                  to use <code className="text-slate-400">/kilrun.png</code>. Upload saves
                  to disk automatically — then hit Save.
                </p>
                <ImageUploadField
                  label="Hub page background"
                  value={siteForm.backgroundUrl}
                  onChange={(v) => setSiteForm((f) => ({ ...f, backgroundUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                  kind="bg"
                  widePreview
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Full-page backdrop behind the entire hub chrome.
                </p>
                <ImageUploadField
                  label="Home hero background"
                  value={siteForm.homeHeroImage}
                  onChange={(v) => setSiteForm((f) => ({ ...f, homeHeroImage: v }))}
                  className="space-y-1 sm:col-span-2"
                  kind="hero"
                  widePreview
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Live Arena banner on the homepage (mouse / tap parallax). Leave empty
                  for the default arena image.
                </p>
                <ImageUploadField
                  label="Landing hero image"
                  value={siteForm.landingHeroImage}
                  onChange={(v) => setSiteForm((f) => ({ ...f, landingHeroImage: v }))}
                  className="space-y-1 sm:col-span-2"
                  kind="hero"
                  widePreview
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Big banner on the public landing page (also pointer-reactive).
                </p>
                {(
                  [
                    ['headerTitle', 'Header / home title'],
                    ['headerSubtitle', 'Header subtitle'],
                    ['gameDisabledMsg', 'Game disabled message'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1 sm:col-span-2">
                    <Label>{label}</Label>
                    <Input
                      value={siteForm[key]}
                      onChange={(e) =>
                        setSiteForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between sm:col-span-1 rounded-lg border border-slate-700/50 p-3">
                  <div>
                    <p className="font-medium">Disable game</p>
                    <p className="text-xs text-slate-400">Blocks Play → Deathrun</p>
                  </div>
                  <Switch
                    checked={siteForm.gameDisabled}
                    onCheckedChange={(v) =>
                      setSiteForm((f) => ({ ...f, gameDisabled: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between sm:col-span-1 rounded-lg border border-slate-700/50 p-3">
                  <div>
                    <p className="font-medium">Enable live chat</p>
                    <p className="text-xs text-slate-400">Home hub chat</p>
                  </div>
                  <Switch
                    checked={siteForm.chatEnabled}
                    onCheckedChange={(v) =>
                      setSiteForm((f) => ({ ...f, chatEnabled: v }))
                    }
                  />
                </div>
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'site'}
                  onClick={() =>
                    runAction('site', async () => {
                      const saved = await updateSiteSettings(siteForm);
                      broadcastSiteSettings(saved);
                      toast({ title: 'Site settings saved' });
                    })
                  }
                >
                  {busyKey === 'site' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Save site settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="users" className="mt-4 space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="bg-slate-800/40 border-slate-700/30">
              <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar>
                    <AvatarImage src={u.avatarUrl} />
                    <AvatarFallback>{u.username.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className={`font-semibold truncate ${getRoleTextColorClass(u.role, u.isVip)}`}>
                      {u.username}
                      {u.isMuted && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px] border-amber-500/50 text-amber-400"
                        >
                          Muted
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {u.id} · {u.steamId} · {u.vpCurrency} VP · {u.xpProgress} XP
                      {u.isBanned ? ' · BANNED' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isAdmin && (
                    <Select
                      value={u.role}
                      disabled={busyKey === `role-${u.id}`}
                      onValueChange={(role) =>
                        runAction(`role-${u.id}`, async () => {
                          await adminSetUserRole(u.id, role);
                          toast({ title: `Set ${u.username} to ${role}` });
                          await reload();
                        })
                      }
                    >
                      <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant={u.isMuted ? 'default' : 'outline'}
                    size="sm"
                    disabled={busyKey === `mute-${u.id}`}
                    onClick={() =>
                      runAction(`mute-${u.id}`, async () => {
                        await adminSetMuted(u.id, !u.isMuted);
                        toast({ title: u.isMuted ? `Unmuted ${u.username}` : `Muted ${u.username}` });
                        await reload();
                      })
                    }
                  >
                    {busyKey === `mute-${u.id}` && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    )}
                    {u.isMuted ? 'Unmute' : 'Mute'}
                  </Button>
                  <Button
                    variant={u.isBanned ? 'default' : 'destructive'}
                    size="sm"
                    disabled={busyKey === `ban-${u.id}`}
                    onClick={() =>
                      runAction(`ban-${u.id}`, async () => {
                        await adminSetBanned(u.id, !u.isBanned);
                        toast({ title: u.isBanned ? `Unbanned ${u.username}` : `Banned ${u.username}` });
                        await reload();
                      })
                    }
                  >
                    {busyKey === `ban-${u.id}` && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    )}
                    {u.isBanned ? 'Unban' : 'Ban'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="moderation" className="mt-4 space-y-4">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-primary" /> Live chat moderation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-400">
                Wipes every message from the hub&apos;s global live chat. This cannot be
                undone. Muted players (Users tab) can&apos;t post in chat or the forums
                until unmuted.
              </p>
              <Button
                variant="destructive"
                disabled={busyKey === 'clear-chat'}
                onClick={() =>
                  runAction('clear-chat', async () => {
                    await adminClearGlobalChat();
                    toast({ title: 'Global chat cleared' });
                  })
                }
              >
                {busyKey === 'clear-chat' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Clear global chat
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader>
              <CardTitle>Muted players</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {users.filter((u) => u.isMuted).length === 0 ? (
                <p className="text-sm text-slate-400">No one is muted right now.</p>
              ) : (
                users
                  .filter((u) => u.isMuted)
                  .map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/40 p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={u.avatarUrl} />
                          <AvatarFallback>{u.username.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span
                          className={`text-sm truncate ${getRoleTextColorClass(u.role, u.isVip)}`}
                        >
                          {u.username}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyKey === `mute-${u.id}`}
                        onClick={() =>
                          runAction(`mute-${u.id}`, async () => {
                            await adminSetMuted(u.id, false);
                            toast({ title: `Unmuted ${u.username}` });
                            await reload();
                          })
                        }
                      >
                        {busyKey === `mute-${u.id}` && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        )}
                        Unmute
                      </Button>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="awards" className="mt-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Award players</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>User ID</Label>
                  <Input
                    value={awardForm.userId}
                    onChange={(e) =>
                      setAwardForm((f) => ({ ...f, userId: e.target.value }))
                    }
                    placeholder="Paste user ObjectId from Users tab"
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>XP amount</Label>
                  <Input
                    type="number"
                    value={awardForm.xp}
                    onChange={(e) =>
                      setAwardForm((f) => ({
                        ...f,
                        xp: Number(e.target.value) || 0,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>VP amount</Label>
                  <Input
                    type="number"
                    value={awardForm.vp}
                    onChange={(e) =>
                      setAwardForm((f) => ({
                        ...f,
                        vp: Number(e.target.value) || 0,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Badge key</Label>
                  <Select
                    value={awardForm.badgeKey || undefined}
                    onValueChange={(v) =>
                      setAwardForm((f) => ({ ...f, badgeKey: v }))
                    }
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700">
                      <SelectValue placeholder="Select badge" />
                    </SelectTrigger>
                    <SelectContent>
                      {badges.map((b) => (
                        <SelectItem key={b.id} value={b.key}>
                          {b.title} ({b.key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={busyKey === 'award-xp'}
                  onClick={() =>
                    runAction('award-xp', async () => {
                      await adminAwardXp(awardForm.userId, awardForm.xp);
                      toast({ title: `Awarded ${awardForm.xp} XP` });
                    })
                  }
                >
                  {busyKey === 'award-xp' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Award XP
                </Button>
                <Button
                  disabled={busyKey === 'award-vp'}
                  onClick={() =>
                    runAction('award-vp', async () => {
                      await adminAwardVp(awardForm.userId, awardForm.vp);
                      toast({ title: `Awarded ${awardForm.vp} VP` });
                    })
                  }
                >
                  {busyKey === 'award-vp' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Award VP
                </Button>
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'award-badge'}
                  onClick={() =>
                    runAction('award-badge', async () => {
                      await adminAwardBadge(awardForm.userId, awardForm.badgeKey);
                      toast({ title: 'Badge awarded' });
                    })
                  }
                >
                  {busyKey === 'award-badge' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Award badge
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="missions" className="mt-4 space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Add mission template</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(['key', 'title', 'description'] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <Label className="capitalize">{field}</Label>
                    <Input
                      value={missionForm[field]}
                      onChange={(e) =>
                        setMissionForm((f) => ({ ...f, [field]: e.target.value }))
                      }
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={missionForm.category}
                    onValueChange={(v) => setMissionForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="game">In-Game</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Requirement type</Label>
                  <RequirementTypeSelect
                    value={missionForm.metric}
                    onValueChange={(v) => setMissionForm((f) => ({ ...f, metric: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Reward XP</Label>
                  <Input
                    type="number"
                    value={missionForm.rewardXp}
                    onChange={(e) =>
                      setMissionForm((f) => ({
                        ...f,
                        rewardXp: Number(e.target.value) || 0,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Target</Label>
                  <Input
                    type="number"
                    value={missionForm.targetCount}
                    onChange={(e) =>
                      setMissionForm((f) => ({
                        ...f,
                        targetCount: Number(e.target.value) || 1,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <ImageUploadField
                  label="Icon image (optional)"
                  value={missionForm.iconImageUrl}
                  onChange={(v) => setMissionForm((f) => ({ ...f, iconImageUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                />
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'create-mission'}
                  onClick={() =>
                    runAction('create-mission', async () => {
                      await adminUpsertMissionTemplate(missionForm);
                      toast({ title: 'Mission saved' });
                      await reload();
                    })
                  }
                >
                  {busyKey === 'create-mission' && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  Create mission
                </Button>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {missions.map((m) => (
                <Card key={m.id} className="bg-slate-800/40 border-slate-700/30">
                  <CardContent className="py-3 flex justify-between gap-2 flex-wrap items-center">
                    {m.iconImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.iconImageUrl}
                        alt=""
                        className="w-8 h-8 rounded object-cover shrink-0"
                      />
                    )}
                    <div>
                      <p className="font-semibold">
                        {m.title}{' '}
                        <Badge variant="outline" className="ml-1">
                          {m.category}
                        </Badge>
                      </p>
                      <p className="text-xs text-slate-400">
                        {m.key} · {m.metric} · target {m.targetCount} · +{m.rewardXp}{' '}
                        XP · {m.isActive ? 'active' : 'off'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="achievements" className="mt-4 space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Add achievement</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(['key', 'title', 'description', 'icon'] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <Label className="capitalize">{field}</Label>
                    <Input
                      value={achForm[field]}
                      onChange={(e) =>
                        setAchForm((f) => ({ ...f, [field]: e.target.value }))
                      }
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={achForm.category}
                    onValueChange={(v) => setAchForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="game">In-Game</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Requirement type</Label>
                  <RequirementTypeSelect
                    value={achForm.metric}
                    onValueChange={(v) => setAchForm((f) => ({ ...f, metric: v }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Target</Label>
                  <Input
                    type="number"
                    value={achForm.targetCount}
                    onChange={(e) =>
                      setAchForm((f) => ({
                        ...f,
                        targetCount: Number(e.target.value) || 1,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>XP reward</Label>
                  <Input
                    type="number"
                    value={achForm.xpReward}
                    onChange={(e) =>
                      setAchForm((f) => ({
                        ...f,
                        xpReward: Number(e.target.value) || 0,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <ImageUploadField
                  label="Icon image (optional, overrides icon keyword)"
                  value={achForm.iconImageUrl}
                  onChange={(v) => setAchForm((f) => ({ ...f, iconImageUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                />
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'create-achievement'}
                  onClick={() =>
                    runAction('create-achievement', async () => {
                      await adminUpsertAchievement(achForm);
                      toast({ title: 'Achievement saved' });
                      await reload();
                    })
                  }
                >
                  {busyKey === 'create-achievement' && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  Create achievement
                </Button>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {achievements.map((a) => (
                <Card key={a.id} className="bg-slate-800/40 border-slate-700/30">
                  <CardContent className="py-3 flex items-center gap-3">
                    {a.iconImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.iconImageUrl}
                        alt=""
                        className="w-8 h-8 rounded object-cover shrink-0"
                      />
                    )}
                    <div>
                      <p className="font-semibold">
                        {a.title}{' '}
                        <Badge variant="outline">{a.category}</Badge>
                      </p>
                      <p className="text-xs text-slate-400">
                        {a.key} · {a.metric} ≥ {a.targetCount} · +{a.xpReward} XP
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="badges" className="mt-4 space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Add badge</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(['key', 'title', 'description', 'icon'] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <Label className="capitalize">{field}</Label>
                    <Input
                      value={badgeForm[field]}
                      onChange={(e) =>
                        setBadgeForm((f) => ({ ...f, [field]: e.target.value }))
                      }
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Rarity</Label>
                  <Select
                    value={badgeForm.rarity}
                    onValueChange={(v) => setBadgeForm((f) => ({ ...f, rarity: v }))}
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Requirement type</Label>
                  <RequirementTypeSelect
                    value={badgeForm.metric}
                    onValueChange={(v) => setBadgeForm((f) => ({ ...f, metric: v }))}
                  />
                  <p className="text-xs text-slate-500">
                    Use &quot;manual&quot; (type it directly) for staff-only awards with no
                    automatic unlock.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Target</Label>
                  <Input
                    type="number"
                    value={badgeForm.targetCount}
                    onChange={(e) =>
                      setBadgeForm((f) => ({
                        ...f,
                        targetCount: Number(e.target.value) || 1,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <ImageUploadField
                  label="Icon image (optional, overrides icon keyword)"
                  value={badgeForm.iconImageUrl}
                  onChange={(v) => setBadgeForm((f) => ({ ...f, iconImageUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                />
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'create-badge'}
                  onClick={() =>
                    runAction('create-badge', async () => {
                      await adminUpsertBadge(badgeForm);
                      toast({ title: 'Badge saved' });
                      await reload();
                    })
                  }
                >
                  {busyKey === 'create-badge' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create badge
                </Button>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {badges.map((b) => (
                <Card key={b.id} className="bg-slate-800/40 border-slate-700/30">
                  <CardContent className="py-3 flex items-center gap-3">
                    {b.iconImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.iconImageUrl}
                        alt=""
                        className="w-8 h-8 rounded object-cover shrink-0"
                      />
                    )}
                    <div>
                      <p className="font-semibold">
                        {b.title}{' '}
                        <Badge variant="outline">{b.rarity}</Badge>
                      </p>
                      <p className="text-xs text-slate-400">
                        {b.key} · {b.metric} ≥ {b.targetCount}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        <TabsContent value="support" className="mt-4 space-y-2">
          {tickets.length === 0 ? (
            <p className="text-slate-400">No tickets.</p>
          ) : (
            tickets.map((t) => (
              <Card key={t.id} className="bg-slate-800/40 border-slate-700/30">
                <CardContent className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t.subject}</p>
                      <p className="text-xs text-slate-400">
                        {t.user.username} · {t.category}
                      </p>
                    </div>
                    <Badge className="capitalize">{t.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{t.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {['open', 'in_progress', 'resolved', 'closed'].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={t.status === status ? 'default' : 'outline'}
                        disabled={busyKey === `ticket-${t.id}`}
                        onClick={() =>
                          runAction(`ticket-${t.id}`, async () => {
                            await adminUpdateTicketStatus(t.id, status);
                            toast({ title: `Ticket set to "${status}"` });
                            await reload();
                          })
                        }
                      >
                        {busyKey === `ticket-${t.id}` && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        )}
                        {status}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    placeholder="Staff note..."
                    defaultValue={t.staffNote}
                    className="bg-slate-900/50 border-slate-700"
                    onBlur={async (e) => {
                      if (e.target.value !== t.staffNote) {
                        await adminUpdateTicketStatus(t.id, t.status, e.target.value);
                        toast({ title: 'Note saved' });
                      }
                    }}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="shop" className="mt-4 space-y-4">
            <BannerGenerator onCreated={reload} />

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Add store item</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={itemForm.itemName}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, itemName: e.target.value }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>SKU</Label>
                  <Input
                    value={itemForm.itemSku}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, itemSku: e.target.value }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Input
                    value={itemForm.itemCategory}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, itemCategory: e.target.value }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>VP price</Label>
                  <Input
                    type="number"
                    value={itemForm.vpPrice}
                    onChange={(e) =>
                      setItemForm((f) => ({
                        ...f,
                        vpPrice: Number(e.target.value) || 0,
                      }))
                    }
                    className="bg-slate-900/50 border-slate-700"
                  />
                </div>
                <ImageUploadField
                  label="Image (optional)"
                  value={itemForm.imageUrl}
                  onChange={(v) => setItemForm((f) => ({ ...f, imageUrl: v }))}
                  className="space-y-1 sm:col-span-2"
                />
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'create-item'}
                  onClick={() =>
                    runAction('create-item', async () => {
                      await adminUpsertStoreItem({
                        ...itemForm,
                        imageUrl: itemForm.imageUrl || undefined,
                      });
                      setItemForm({
                        itemName: '',
                        itemCategory: 'Cosmetic',
                        itemSku: '',
                        vpPrice: 100,
                        imageUrl: '',
                      });
                      toast({ title: 'Item created' });
                      await reload();
                    })
                  }
                >
                  {busyKey === 'create-item' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create item
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {items.map((item) => {
                const banner = item.bannerConfig ? normalizeBannerConfig(item.bannerConfig) : null;
                return (
                  <Card key={item.id} className="bg-slate-800/40 border-slate-700/30">
                    <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {banner ? (
                          <div
                            className={`w-12 h-8 rounded shrink-0 ${bannerAnimationClass(banner)}`}
                            style={bannerStyle(banner)}
                          />
                        ) : item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover shrink-0"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {item.itemName}{' '}
                            {item.cosmeticSlot && (
                              <Badge variant="outline" className="ml-1 capitalize text-[10px]">
                                {item.cosmeticSlot}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {item.itemSku} · {item.vpPrice} VP · {item.itemCategory}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyKey === `delete-item-${item.id}`}
                        onClick={() =>
                          runAction(`delete-item-${item.id}`, async () => {
                            await adminDeleteStoreItem(item.id);
                            toast({ title: `Deleted ${item.itemName}` });
                            await reload();
                          })
                        }
                      >
                        {busyKey === `delete-item-${item.id}` && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        )}
                        Delete
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="content" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Publish news</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Title"
                  value={newsForm.title}
                  onChange={(e) => setNewsForm((f) => ({ ...f, title: e.target.value }))}
                  className="bg-slate-900/50 border-slate-700"
                />
                <Input
                  placeholder="Summary"
                  value={newsForm.summary}
                  onChange={(e) =>
                    setNewsForm((f) => ({ ...f, summary: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
                <Textarea
                  placeholder="Body"
                  value={newsForm.body}
                  onChange={(e) => setNewsForm((f) => ({ ...f, body: e.target.value }))}
                  className="bg-slate-900/50 border-slate-700"
                />
                <Button
                  disabled={busyKey === 'publish-news'}
                  onClick={() =>
                    runAction('publish-news', async () => {
                      await adminCreateNews(newsForm);
                      setNewsForm({ title: '', summary: '', body: '' });
                      toast({ title: 'News published' });
                    })
                  }
                >
                  {busyKey === 'publish-news' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Publish news
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Publish guide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Title"
                  value={guideForm.title}
                  onChange={(e) =>
                    setGuideForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
                <Input
                  placeholder="Summary"
                  value={guideForm.summary}
                  onChange={(e) =>
                    setGuideForm((f) => ({ ...f, summary: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
                <Input
                  placeholder="Category"
                  value={guideForm.category}
                  onChange={(e) =>
                    setGuideForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
                <Textarea
                  placeholder="Body"
                  value={guideForm.body}
                  onChange={(e) => setGuideForm((f) => ({ ...f, body: e.target.value }))}
                  className="bg-slate-900/50 border-slate-700"
                />
                <Button
                  disabled={busyKey === 'publish-guide'}
                  onClick={() =>
                    runAction('publish-guide', async () => {
                      await adminCreateGuide(guideForm);
                      setGuideForm({
                        title: '',
                        summary: '',
                        body: '',
                        category: 'general',
                      });
                      toast({ title: 'Guide published' });
                    })
                  }
                >
                  {busyKey === 'publish-guide' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Publish guide
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
