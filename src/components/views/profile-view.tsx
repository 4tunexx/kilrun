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
  Gem,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMatchStats, getSessionUser, getStatsSummary, type StatsSummary } from '@/lib/actions';
import {
  equipInventoryItem,
  getMyInventory,
  getMyProfileActivity,
  unequipCosmeticSlot,
  updateProfileSettings,
} from '@/lib/social-actions';
import type { MatchStat, User as UserModel } from '@/generated/prisma';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { ShowcaseEditor } from '@/components/views/profile/showcase-editor';
import { useToast } from '@/hooks/use-toast';
import { EmailVerificationForm } from '@/components/email-verification-form';
import { COUNTRIES, flagUrl, getCountryName } from '@/lib/countries';

type InventoryRow = Awaited<ReturnType<typeof getMyInventory>>[number];
type ProfileActivity = Awaited<ReturnType<typeof getMyProfileActivity>>;

export default function ProfileView({ userId }: { userId: string }) {
  const [user, setUser] = useState<UserModel | null>(null);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [history, setHistory] = useState<MatchStat[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [activity, setActivity] = useState<ProfileActivity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [cosmeticBusyId, setCosmeticBusyId] = useState<string | null>(null);
  const { toast } = useToast();

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
    ]).then(([u, s, h, inv, act]) => {
      if (!isMounted) return;
      setUser(u);
      setBio(u?.bio ?? '');
      setCountryCode(u?.countryCode ?? '');
      setNotifyPush(u?.notifyPush ?? true);
      setNotifyEmail(u?.notifyEmail ?? true);
      setSummary(s);
      setHistory(h);
      setInventory(inv);
      setActivity(act);
      setIsLoading(false);
      if (u && !u.emailVerified) setShowEmailForm(true);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const banners = inventory.filter((i) => i.cosmeticSlot === 'banner');
  const equippedBanner = user?.equippedBannerConfig
    ? normalizeBannerConfig(user.equippedBannerConfig)
    : null;

  const handleEquipBanner = async (item: InventoryRow) => {
    setCosmeticBusyId(item.id);
    try {
      await equipInventoryItem(item.id);
      toast({ title: `Equipped ${item.itemName}` });
      reloadCosmetics();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not equip', variant: 'destructive' });
    } finally {
      setCosmeticBusyId(null);
    }
  };

  const handleUnequipBanner = async () => {
    setCosmeticBusyId('banner');
    try {
      await unequipCosmeticSlot('banner');
      toast({ title: 'Banner unequipped' });
      reloadCosmetics();
    } finally {
      setCosmeticBusyId(null);
    }
  };

  const savePublicProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateProfileSettings({ bio, countryCode });
      setUser(updated);
      toast({ title: 'Profile saved' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveNotificationPrefs = async (next: {
    notifyPush?: boolean;
    notifyEmail?: boolean;
  }) => {
    setPrefsSaving(true);
    try {
      const updated = await updateProfileSettings(next);
      setUser(updated);
      if (typeof next.notifyPush === 'boolean') setNotifyPush(next.notifyPush);
      if (typeof next.notifyEmail === 'boolean') setNotifyEmail(next.notifyEmail);
      toast({ title: 'Notification preferences saved' });
    } catch {
      toast({ title: 'Could not save preferences', variant: 'destructive' });
    } finally {
      setPrefsSaving(false);
    }
  };

  return (
    <div className="pb-6">
      <div
        className={`relative h-28 sm:h-40 w-full ${
          equippedBanner
            ? bannerAnimationClass(equippedBanner)
            : 'bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800'
        }`}
        style={equippedBanner ? bannerStyle(equippedBanner) : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
      </div>

      <div className="px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 -mt-12 sm:-mt-16 mb-6">
          <div className="relative shrink-0">
            <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-slate-900 shadow-2xl">
              <AvatarImage
                src={user?.avatarUrl}
                alt={user?.username ?? 'Player avatar'}
              />
              <AvatarFallback>{user?.username?.charAt(0) ?? '?'}</AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1
              className={`text-3xl sm:text-5xl font-black truncate flex items-center gap-3 ${getRoleTextColorClass(
                user?.role,
                user?.isVip
              )}`}
            >
              {user?.username ?? 'Loading...'}
              {countryCode && (
                <Image
                  src={flagUrl(countryCode, 40)}
                  alt={getCountryName(countryCode) ?? countryCode}
                  width={28}
                  height={21}
                  className="rounded-sm shadow-md shrink-0"
                  unoptimized
                />
              )}
            </h1>
            <p className="text-base sm:text-xl text-slate-400">
              {user?.createdAt
                ? `Joined ${formatDistanceToNow(new Date(user.createdAt))} ago`
                : ''}
            </p>
            <p className="text-sm text-slate-400 capitalize mt-1">
              Role: {user?.role ?? 'player'}
              {user?.isVip ? ' · VIP' : ''}
            </p>
          </div>
        </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-800/60 p-1 mb-4">
          <TabsTrigger value="profile" className="flex-none">
            Profile
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex-none">
            Statistics
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-none">
            Activity
          </TabsTrigger>
          <TabsTrigger value="match-history" className="flex-none">
            Match History
          </TabsTrigger>
          <TabsTrigger value="showcase" className="flex-none">
            Showcase
          </TabsTrigger>
          <TabsTrigger value="cosmetics" className="flex-none">
            Cosmetics
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-none">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0 space-y-4">
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
                <Gem className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
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

          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>This is how other players see you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
              <Button disabled={saving} onClick={savePublicProfile}>
                <Save className="mr-2 h-4 w-4" />
                Save Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Player Statistics</CardTitle>
              <CardDescription>
                Your all-time performance stats.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.totalRuns ?? 0}</p>
                <p className="text-slate-400">Total Runs</p>
              </div>
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.bestScore ?? 0}</p>
                <p className="text-slate-400">Best Score</p>
              </div>
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.bestDistance ?? 0}m</p>
                <p className="text-slate-400">Best Distance</p>
              </div>
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.avgScore ?? 0}</p>
                <p className="text-slate-400">Avg Score</p>
              </div>
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
              <CardDescription>Your last {history.length} recorded runs.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading match history...
                </div>
              ) : history.length === 0 ? (
                <p className="text-center py-12 text-slate-400">
                  No runs recorded yet. Launch the game to build your match history.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 hover:bg-transparent">
                      <TableHead>Score</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Lives Remaining</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((match) => (
                      <TableRow key={match.id} className="border-slate-700/50">
                        <TableCell className="font-bold">{match.score}</TableCell>
                        <TableCell>{match.distance}m</TableCell>
                        <TableCell className="font-mono">{match.livesRemaining}</TableCell>
                        <TableCell className="text-right text-slate-400">
                          {formatDistanceToNow(new Date(match.datePlayed))} ago
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
              <div
                className={`h-20 sm:h-28 w-full rounded-lg border border-slate-700/50 ${
                  equippedBanner
                    ? bannerAnimationClass(equippedBanner)
                    : 'bg-gradient-to-r from-slate-800 to-slate-700'
                }`}
                style={equippedBanner ? bannerStyle(equippedBanner) : undefined}
              />
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
                    onClick={handleUnequipBanner}
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
                        <div
                          className={`h-12 w-full ${cfg ? bannerAnimationClass(cfg) : 'bg-slate-900'}`}
                          style={cfg ? bannerStyle(cfg) : undefined}
                        />
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
                              onClick={() => handleEquipBanner(item)}
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
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setShowEmailForm(true)}
                    >
                      <Mail className="mr-2 h-4 w-4" /> Change email
                    </Button>
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
  );
}
