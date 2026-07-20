'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Award,
  ClipboardList,
  FileText,
  Database,
  Flame,
  LayoutDashboard,
  Loader2,
  Map as MapIcon,
  Medal,
  Megaphone,
  Minus,
  Plus,
  ScrollText,
  Settings2,
  Shield,
  ShoppingBag,
  Target,
  Ticket,
  Trash2,
  Trophy,
  Users,
  Gem,
} from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { RequirementTypeSelect } from '@/components/views/admin/requirement-type-select';
import { CosmeticsStudio } from '@/components/views/admin/cosmetics-studio';
import { LogoStyleEditor } from '@/components/views/admin/logo-style-editor';
import { AdminDashboardPanel } from '@/components/views/admin/admin-dashboard-panel';
import { AdminMapEditorPanel } from '@/components/views/admin/admin-map-editor-panel';
import { AdminSiteLayoutPanel } from '@/components/views/admin/admin-site-layout-panel';
import { AdminNewsPanel } from '@/components/views/admin/admin-news-panel';
import { AdminPremiumPanel } from '@/components/views/admin/admin-premium-panel';
import {
  DEFAULT_HEADER_LOGO_STYLE,
  normalizeHeaderLogoStyle,
  serializeHeaderLogoStyle,
  type HeaderLogoStyle,
} from '@/lib/logo-style';
import {
  adminAdjustVp,
  adminBroadcastAnnouncement,
  adminClearFireSale,
  adminCreateGuide,
  adminDeleteStoreItem,
  adminListTickets,
  adminListUsers,
  adminSetBanned,
  adminSetFireSale,
  adminSetMuted,
  adminSetUserRole,
  adminUpdateTicketStatus,
  adminUpsertStoreItem,
} from '@/lib/social-actions';
import { AdminUserDetailSheet } from '@/components/views/admin/admin-user-detail-sheet';
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
  adminClearGlobalChat,
} from '@/lib/progression-actions';
import { adminListAuditLogs } from '@/lib/audit';
import { syncClerkBrandingToKilrun } from '@/lib/clerk-branding';
import { normalizeLandingSlides, type LandingHeroSlide } from '@/lib/cosmetics';
import { ACCOUNT_ROLES } from '@/lib/roles';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { getRoleTextColorClass } from '@/lib/role-colors';
import {
  formatFireSaleCountdown,
  getEffectiveVpPrice,
  isFireSaleActive,
} from '@/lib/shop-catalog';
import { SKIN_ATTACH_SLOTS } from '@/lib/player-skins';
import { adminSyncDatabaseSchema } from '@/lib/admin-db-sync';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STORE_CATEGORIES = [
  'Skins',
  'Perks',
  'Boosts',
  'Emotes',
  'Other',
] as const;

const TAB_META: Record<string, { label: string; icon: ReactNode }> = {
  dashboard: { label: 'Dashboard', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  site: { label: 'Site', icon: <Settings2 className="h-3.5 w-3.5" /> },
  users: { label: 'Users', icon: <Users className="h-3.5 w-3.5" /> },
  moderation: { label: 'Moderation', icon: <Shield className="h-3.5 w-3.5" /> },
  audit: { label: 'Audit', icon: <ScrollText className="h-3.5 w-3.5" /> },
  awards: { label: 'Awards', icon: <Award className="h-3.5 w-3.5" /> },
  missions: { label: 'Missions', icon: <Target className="h-3.5 w-3.5" /> },
  achievements: { label: 'Achievements', icon: <Trophy className="h-3.5 w-3.5" /> },
  badges: { label: 'Badges', icon: <Medal className="h-3.5 w-3.5" /> },
  support: { label: 'Support', icon: <Ticket className="h-3.5 w-3.5" /> },
  shop: { label: 'Shop', icon: <ShoppingBag className="h-3.5 w-3.5" /> },
  premium: { label: 'Premium', icon: <Gem className="h-3.5 w-3.5" /> },
  maps: { label: 'Map Editor', icon: <MapIcon className="h-3.5 w-3.5" /> },
  content: { label: 'Content', icon: <FileText className="h-3.5 w-3.5" /> },
};

const MODERATOR_TABS = ['dashboard', 'users', 'moderation', 'audit', 'support'] as const;
const ADMIN_TABS = [
  'dashboard',
  'site',
  'users',
  'moderation',
  'audit',
  'awards',
  'missions',
  'achievements',
  'badges',
  'support',
  'shop',
  'premium',
  'maps',
  'content',
] as const;

export default function AdminView({ viewerRole }: { viewerRole?: string }) {
  const isAdmin = viewerRole === 'admin';
  const visibleTabs = isAdmin ? ADMIN_TABS : MODERATOR_TABS;

  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [awardQuery, setAwardQuery] = useState('');
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
    itemCategory: 'Skins',
    itemSku: '',
    vpPrice: 100,
    imageUrl: '',
    cosmeticSlot: 'skin_hat' as string,
  });
  const [fireSaleSelected, setFireSaleSelected] = useState<string[]>([]);
  const [fireSaleForm, setFireSaleForm] = useState({
    percent: 25,
    durationHours: 24,
  });
  const [announceForm, setAnnounceForm] = useState({
    title: '',
    body: '',
  });
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [guideForm, setGuideForm] = useState({
    title: '',
    summary: '',
    body: '',
    category: 'general',
  });
  const [siteForm, setSiteForm] = useState({
    logoUrl: '',
    headerLogoUrl: '',
    headerLogoStyle: DEFAULT_HEADER_LOGO_STYLE as HeaderLogoStyle,
    backgroundUrl: '',
    homeHeroImage: '',
    headerTitle: '',
    headerSubtitle: '',
    landingHeroImage: '',
    landingHeroSlides: [] as LandingHeroSlide[],
    gameDisabled: false,
    gameDisabledMsg: '',
    gameDisabledUntil: '' as string,
    chatEnabled: true,
  });
  const [userSearch, setUserSearch] = useState('');
  const [siteDirty, setSiteDirty] = useState(false);
  const [awardForm, setAwardForm] = useState({
    userId: '',
    xp: 100,
    vp: 100,
    badgeKey: '',
  });
  const emptyMissionForm = {
    id: '' as string,
    key: '',
    title: '',
    description: '',
    rewardXp: 50,
    targetCount: 1,
    metric: 'runs',
    missionKind: 'main' as 'main' | 'daily',
    category: 'game',
    iconImageUrl: '',
    isActive: true,
  };
  const [missionForm, setMissionForm] = useState(emptyMissionForm);
  const emptyAchForm = {
    id: '' as string,
    key: '',
    title: '',
    description: '',
    category: 'game',
    metric: 'runs',
    targetCount: 1,
    xpReward: 50,
    icon: 'trophy',
    iconImageUrl: '',
    isActive: true,
  };
  const [achForm, setAchForm] = useState(emptyAchForm);
  const emptyBadgeForm = {
    id: '' as string,
    key: '',
    title: '',
    description: '',
    rarity: 'common',
    icon: 'award',
    metric: 'manual',
    targetCount: 1,
    iconImageUrl: '',
    isActive: true,
  };
  const [badgeForm, setBadgeForm] = useState(emptyBadgeForm);

  const reload = async () => {
    const ticketStatus =
      ticketFilter === 'all' ? undefined : ticketFilter;
    if (isAdmin) {
      const [u, t, store, settings, m, a, b, logs] = await Promise.all([
        adminListUsers(200),
        adminListTickets(ticketStatus),
        getStoreItems(),
        getSiteSettings(),
        adminListMissionTemplates(),
        adminListAchievements(),
        adminListBadges(),
        adminListAuditLogs(),
      ]);
      setUsers(u);
      setTickets(t);
      setItems(store);
      setMissions(m);
      setAchievements(a);
      setBadges(b);
      setAuditLogs(logs);
      let landingHeroSlides = normalizeLandingSlides(
        (settings as { landingHeroSlides?: string }).landingHeroSlides
      );
      if (landingHeroSlides.length === 0 && settings.landingHeroImage) {
        landingHeroSlides = [
          { src: settings.landingHeroImage, alt: 'Kilrun' },
        ];
      }
      setSiteForm({
        logoUrl: settings.logoUrl ?? '',
        headerLogoUrl: settings.headerLogoUrl ?? '',
        headerLogoStyle: normalizeHeaderLogoStyle(
          (settings as { headerLogoStyle?: string }).headerLogoStyle
        ),
        backgroundUrl: settings.backgroundUrl ?? '',
        homeHeroImage: settings.homeHeroImage ?? '',
        headerTitle: settings.headerTitle ?? '',
        headerSubtitle: settings.headerSubtitle ?? '',
        landingHeroImage: settings.landingHeroImage ?? '',
        landingHeroSlides,
        gameDisabled: settings.gameDisabled,
        gameDisabledMsg: settings.gameDisabledMsg ?? '',
        gameDisabledUntil: settings.gameDisabledUntil
          ? new Date(settings.gameDisabledUntil).toISOString().slice(0, 16)
          : '',
        chatEnabled: settings.chatEnabled,
      });
      setSiteDirty(false);
    } else {
      const [u, t, logs] = await Promise.all([
        adminListUsers(200),
        adminListTickets(ticketStatus),
        adminListAuditLogs(),
      ]);
      setUsers(u);
      setTickets(t);
      setAuditLogs(logs);
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
          {visibleTabs.map((tab) => {
            const meta = TAB_META[tab] ?? { label: tab, icon: <ClipboardList className="h-3.5 w-3.5" /> };
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                className="flex-none gap-1.5 capitalize"
              >
                {meta.icon}
                {meta.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <AdminDashboardPanel isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="site" className="mt-4 space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Branding & logos</CardTitle>
                  {siteDirty && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-amber-300"
                    >
                      Unsaved changes
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <ImageUploadField
                  label="Sidebar / mark logo (K)"
                  value={siteForm.logoUrl}
                  onChange={(v) => {
                    setSiteForm((f) => ({ ...f, logoUrl: v }));
                    setSiteDirty(true);
                  }}
                  className="space-y-1 sm:col-span-2"
                  kind="mark"
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Small mark in the left rail and footer. Empty →{' '}
                  <code className="text-slate-400">/K2.png</code>.
                </p>
                <ImageUploadField
                  label="Header logo (wordmark)"
                  value={siteForm.headerLogoUrl}
                  onChange={(v) => {
                    setSiteForm((f) => ({ ...f, headerLogoUrl: v }));
                    setSiteDirty(true);
                  }}
                  className="space-y-1 sm:col-span-2"
                  kind="wordmark"
                  widePreview
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Home + landing wordmark. Empty →{' '}
                  <code className="text-slate-400">/kilrun.png</code>. After upload,
                  adjust below, then Save.
                </p>

                <LogoStyleEditor
                  logoUrl={siteForm.headerLogoUrl}
                  heroImage={siteForm.homeHeroImage}
                  style={siteForm.headerLogoStyle}
                  onChange={(headerLogoStyle) => {
                    setSiteForm((f) => ({ ...f, headerLogoStyle }));
                    setSiteDirty(true);
                  }}
                />
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Backgrounds & copy</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <ImageUploadField
                  label="Hub page background"
                  value={siteForm.backgroundUrl}
                  onChange={(v) => {
                    setSiteForm((f) => ({ ...f, backgroundUrl: v }));
                    setSiteDirty(true);
                  }}
                  className="space-y-1 sm:col-span-2"
                  kind="bg"
                  widePreview
                />
                <ImageUploadField
                  label="Home hero background"
                  value={siteForm.homeHeroImage}
                  onChange={(v) => {
                    setSiteForm((f) => ({ ...f, homeHeroImage: v }));
                    setSiteDirty(true);
                  }}
                  className="space-y-1 sm:col-span-2"
                  kind="hero"
                  widePreview
                />
                <p className="text-xs text-slate-500 sm:col-span-2 -mt-2">
                  Parallax banner behind the header logo on the homepage.
                </p>
                <ImageUploadField
                  label="Landing hero image (legacy fallback)"
                  value={siteForm.landingHeroImage}
                  onChange={(v) => {
                    setSiteForm((f) => ({ ...f, landingHeroImage: v }));
                    setSiteDirty(true);
                  }}
                  className="space-y-1 sm:col-span-2"
                  kind="hero"
                  widePreview
                />
                <div className="sm:col-span-2 space-y-3 rounded-lg border border-slate-700/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Landing carousel slides</p>
                      <p className="text-xs text-slate-400">
                        Up to 8 hero images for the landing page carousel.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={siteForm.landingHeroSlides.length >= 8}
                      onClick={() => {
                        setSiteForm((f) => ({
                          ...f,
                          landingHeroSlides: [
                            ...f.landingHeroSlides,
                            { src: '', alt: 'Kilrun' },
                          ].slice(0, 8),
                        }));
                        setSiteDirty(true);
                      }}
                    >
                      Add slide
                    </Button>
                  </div>
                  {siteForm.landingHeroSlides.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No slides yet. Add one or keep the legacy hero image above.
                    </p>
                  ) : (
                    siteForm.landingHeroSlides.map((slide, index) => (
                      <div
                        key={`slide-${index}`}
                        className="space-y-2 rounded-md border border-slate-700/40 bg-slate-900/30 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Label>Slide {index + 1}</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-300 hover:text-red-200"
                            onClick={() => {
                              setSiteForm((f) => ({
                                ...f,
                                landingHeroSlides: f.landingHeroSlides.filter(
                                  (_, i) => i !== index
                                ),
                              }));
                              setSiteDirty(true);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                        <ImageUploadField
                          label="Image"
                          value={slide.src}
                          onChange={(v) => {
                            setSiteForm((f) => ({
                              ...f,
                              landingHeroSlides: f.landingHeroSlides.map((s, i) =>
                                i === index ? { ...s, src: v } : s
                              ),
                            }));
                            setSiteDirty(true);
                          }}
                          kind="hero"
                          widePreview
                        />
                        <Input
                          value={slide.alt ?? ''}
                          onChange={(e) => {
                            setSiteForm((f) => ({
                              ...f,
                              landingHeroSlides: f.landingHeroSlides.map((s, i) =>
                                i === index ? { ...s, alt: e.target.value } : s
                              ),
                            }));
                            setSiteDirty(true);
                          }}
                          placeholder="Alt text"
                          className="bg-slate-900/50 border-slate-700"
                        />
                      </div>
                    ))
                  )}
                </div>
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
                      onChange={(e) => {
                        setSiteForm((f) => ({ ...f, [key]: e.target.value }));
                        setSiteDirty(true);
                      }}
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Features</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between sm:col-span-1 rounded-lg border border-slate-700/50 p-3">
                  <div>
                    <p className="font-medium">Disable game</p>
                    <p className="text-xs text-slate-400">Blocks Play → Deathrun</p>
                  </div>
                  <Switch
                    checked={siteForm.gameDisabled}
                    onCheckedChange={(v) => {
                      setSiteForm((f) => ({ ...f, gameDisabled: v }));
                      setSiteDirty(true);
                    }}
                  />
                </div>
                <div className="flex items-center justify-between sm:col-span-1 rounded-lg border border-slate-700/50 p-3">
                  <div>
                    <p className="font-medium">Enable live chat</p>
                    <p className="text-xs text-slate-400">Home hub chat</p>
                  </div>
                  <Switch
                    checked={siteForm.chatEnabled}
                    onCheckedChange={(v) => {
                      setSiteForm((f) => ({ ...f, chatEnabled: v }));
                      setSiteDirty(true);
                    }}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="gameDisabledUntil">
                    Auto re-enable at (optional)
                  </Label>
                  <Input
                    id="gameDisabledUntil"
                    type="datetime-local"
                    value={siteForm.gameDisabledUntil}
                    onChange={(e) => {
                      setSiteForm((f) => ({
                        ...f,
                        gameDisabledUntil: e.target.value,
                      }));
                      setSiteDirty(true);
                    }}
                    className="bg-slate-900/50 border-slate-700 max-w-md"
                  />
                </div>
                {siteForm.gameDisabled && (
                  <div
                    role="alert"
                    className="sm:col-span-2 rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
                  >
                    <p className="font-semibold text-amber-200">
                      Maintenance preview
                    </p>
                    <p className="mt-1 text-amber-100/90">
                      {siteForm.gameDisabledMsg ||
                        'Kilrun is offline for maintenance.'}
                    </p>
                  </div>
                )}
                <Button
                  className="sm:col-span-2"
                  disabled={busyKey === 'site'}
                  onClick={() =>
                    runAction('site', async () => {
                      const saved = await updateSiteSettings({
                        logoUrl: siteForm.logoUrl,
                        headerLogoUrl: siteForm.headerLogoUrl,
                        backgroundUrl: siteForm.backgroundUrl,
                        homeHeroImage: siteForm.homeHeroImage,
                        headerTitle: siteForm.headerTitle,
                        headerSubtitle: siteForm.headerSubtitle,
                        landingHeroImage: siteForm.landingHeroImage,
                        gameDisabled: siteForm.gameDisabled,
                        gameDisabledMsg: siteForm.gameDisabledMsg,
                        chatEnabled: siteForm.chatEnabled,
                        headerLogoStyle: serializeHeaderLogoStyle(
                          siteForm.headerLogoStyle
                        ),
                        landingHeroSlides: JSON.stringify(
                          siteForm.landingHeroSlides
                        ),
                        gameDisabledUntil: siteForm.gameDisabledUntil || null,
                      });
                      broadcastSiteSettings(saved);
                      setSiteDirty(false);
                      toast({
                        title: 'Site settings saved',
                        description: 'Logos and layout are live for everyone.',
                      });
                    })
                  }
                >
                  {busyKey === 'site' && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  Save site settings
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Email branding (Clerk)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-400">
                  Verification emails show the Clerk application name. If players
                  see &quot;My Application&quot;, rename the app to Kilrun in the
                  Clerk Dashboard and upload the K logo under Customize → Emails.
                </p>
                <Button
                  variant="outline"
                  disabled={busyKey === 'clerk-brand'}
                  onClick={() =>
                    runAction('clerk-brand', async () => {
                      const result = await syncClerkBrandingToKilrun();
                      toast({
                        title: result.ok
                          ? 'Clerk branding tips'
                          : 'Clerk branding incomplete',
                        description: [result.message, ...result.steps]
                          .filter(Boolean)
                          .join(' · '),
                        variant: result.ok ? 'default' : 'destructive',
                      });
                    })
                  }
                >
                  {busyKey === 'clerk-brand' && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  Sync Kilrun branding tips
                </Button>
              </CardContent>
            </Card>

            <AdminSiteLayoutPanel />
          </TabsContent>
        )}

        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by username, Steam ID, or user ID…"
              className="bg-slate-900/50 border-slate-700 max-w-md"
            />
            <p className="text-xs text-slate-500">
              {users.length} player{users.length === 1 ? '' : 's'} · click a
              player for inventory & purchases
            </p>
          </div>
          {users
            .filter((u) => {
              const q = userSearch.trim().toLowerCase();
              if (!q) return true;
              return (
                u.username?.toLowerCase().includes(q) ||
                u.steamId?.toLowerCase().includes(q) ||
                u.id?.toLowerCase().includes(q)
              );
            })
            .map((u) => (
            <Card key={u.id} className="bg-slate-800/40 border-slate-700/30">
              <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-md hover:bg-slate-900/40 -m-1 p-1 transition"
                  onClick={() => setDetailUserId(u.id)}
                >
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
                </button>
                <div className="flex flex-wrap gap-2">
                  {isAdmin && (
                    <>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-emerald-400 border-emerald-700/50"
                        title="Give VP"
                        disabled={busyKey === `vp-plus-${u.id}`}
                        onClick={() => {
                          const raw = window.prompt(
                            `Give VP to ${u.username}`,
                            '100'
                          );
                          const amount = Number(raw);
                          if (!raw || !Number.isFinite(amount) || amount <= 0) return;
                          void runAction(`vp-plus-${u.id}`, async () => {
                            await adminAdjustVp(u.id, Math.floor(amount));
                            toast({ title: `Gave +${Math.floor(amount)} VP` });
                            await reload();
                          });
                        }}
                      >
                        {busyKey === `vp-plus-${u.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-red-400 border-red-700/50"
                        title="Take VP"
                        disabled={busyKey === `vp-minus-${u.id}`}
                        onClick={() => {
                          const raw = window.prompt(
                            `Remove VP from ${u.username}`,
                            '100'
                          );
                          const amount = Number(raw);
                          if (!raw || !Number.isFinite(amount) || amount <= 0) return;
                          void runAction(`vp-minus-${u.id}`, async () => {
                            await adminAdjustVp(u.id, -Math.floor(amount));
                            toast({ title: `Removed ${Math.floor(amount)} VP` });
                            await reload();
                          });
                        }}
                      >
                        {busyKey === `vp-minus-${u.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                      </Button>
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
                    </>
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
                    onClick={() => {
                      if (
                        !u.isBanned &&
                        !window.confirm(
                          `Ban ${u.username}? They will lose access until unbanned.`
                        )
                      ) {
                        return;
                      }
                      void runAction(`ban-${u.id}`, async () => {
                        await adminSetBanned(u.id, !u.isBanned);
                        toast({
                          title: u.isBanned
                            ? `Unbanned ${u.username}`
                            : `Banned ${u.username}`,
                        });
                        await reload();
                      });
                    }}
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
          <AdminUserDetailSheet
            userId={detailUserId}
            open={!!detailUserId}
            onOpenChange={(o) => {
              if (!o) setDetailUserId(null);
            }}
          />
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
                onClick={() => {
                  if (
                    !window.confirm(
                      'Clear every message in global live chat? This cannot be undone.'
                    )
                  ) {
                    return;
                  }
                  void runAction('clear-chat', async () => {
                    await adminClearGlobalChat();
                    toast({ title: 'Global chat cleared' });
                  });
                }}
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

        <TabsContent value="audit" className="mt-4 space-y-3">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Staff action trail</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400 space-y-2">
              <p>
                This log records <span className="text-slate-200 font-medium">every staff admin action</span>{' '}
                across the panel — bans, mutes, awards, broadcasts, role changes, site settings, tickets,
                news/guides, and more. It is <span className="text-slate-200">not</span> filtered to you;
                if you only see your name, you’re usually the staff member who performed those actions.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={busyKey === 'audit-refresh'}
                onClick={() =>
                  runAction('audit-refresh', async () => {
                    const logs = await adminListAuditLogs();
                    setAuditLogs(logs);
                    toast({ title: 'Audit log refreshed' });
                  })
                }
              >
                {busyKey === 'audit-refresh' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Refresh
              </Button>
            </CardContent>
          </Card>
          {auditLogs.length === 0 ? (
            <p className="text-slate-400">No audit log entries yet. Staff actions will appear here.</p>
          ) : (
            auditLogs.map((log) => (
              <Card key={log.id} className="bg-slate-800/40 border-slate-700/30">
                <CardContent className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {log.actorUsername}{' '}
                      <span className="text-primary font-normal">{log.action}</span>
                      {log.targetUsername ? (
                        <span className="text-slate-400 font-normal">
                          {' '}
                          → {log.targetUsername}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(log.createdAt))} ago
                    </p>
                  </div>
                  {log.detail ? (
                    <p className="text-sm text-slate-400 whitespace-pre-wrap">
                      {log.detail}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="awards" className="mt-4 space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  Site announcement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-400">
                  Push a notification to every player. Optionally also send it as a
                  direct message from your account.
                </p>
                <Input
                  placeholder="Announcement title"
                  value={announceForm.title}
                  onChange={(e) =>
                    setAnnounceForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
                <Textarea
                  placeholder="Message body…"
                  value={announceForm.body}
                  onChange={(e) =>
                    setAnnounceForm((f) => ({ ...f, body: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700 min-h-[100px]"
                />
                <p className="text-xs text-slate-400">
                  Sent to every player&apos;s Messages inbox (mail icon), not the bell.
                </p>
                <Button
                  disabled={busyKey === 'broadcast'}
                  onClick={() =>
                    runAction('broadcast', async () => {
                      const r = await adminBroadcastAnnouncement(announceForm);
                      setAnnounceForm({ title: '', body: '' });
                      toast({
                        title: 'Mass message sent',
                        description: `${r.count} players received it in Messages`,
                      });
                    })
                  }
                >
                  {busyKey === 'broadcast' && (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  )}
                  Broadcast to all
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle>Award players</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Player</Label>
                  <Input
                    value={awardQuery}
                    onChange={(e) => setAwardQuery(e.target.value)}
                    placeholder="Search by username…"
                    className="bg-slate-900/50 border-slate-700"
                  />
                  {awardForm.userId && (
                    <p className="text-sm text-slate-300">
                      Selected:{' '}
                      <span className="font-semibold">
                        {users.find((u) => u.id === awardForm.userId)?.username ??
                          awardForm.userId}
                      </span>
                    </p>
                  )}
                  {awardQuery.trim() && (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {users
                        .filter((u) =>
                          u.username
                            ?.toLowerCase()
                            .includes(awardQuery.trim().toLowerCase())
                        )
                        .slice(0, 8)
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setAwardForm((f) => ({ ...f, userId: u.id }));
                              setAwardQuery(u.username);
                            }}
                            className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                              awardForm.userId === u.id
                                ? 'border-primary bg-primary/10'
                                : 'border-slate-700/50 bg-slate-900/40 hover:border-slate-600'
                            }`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={u.avatarUrl} />
                              <AvatarFallback>
                                {u.username?.charAt(0) ?? '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={`font-medium truncate ${getRoleTextColorClass(
                                u.role,
                                u.isVip
                              )}`}
                            >
                              {u.username}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
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
                <CardTitle>
                  {missionForm.id ? 'Edit mission template' : 'Add mission template'}
                </CardTitle>
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
                  <Label>Mission type</Label>
                  <Select
                    value={missionForm.missionKind}
                    onValueChange={(v) =>
                      setMissionForm((f) => ({
                        ...f,
                        missionKind: v as 'main' | 'daily',
                        category: v === 'daily' ? 'daily' : f.category === 'daily' ? 'game' : f.category,
                        metric: v === 'daily' ? 'daily_login' : f.metric,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">Main mission</SelectItem>
                      <SelectItem value="daily">Daily mission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {missionForm.missionKind === 'main' && (
                  <div className="space-y-1">
                    <Label>Board</Label>
                    <Select
                      value={
                        missionForm.category === 'daily'
                          ? 'game'
                          : missionForm.category
                      }
                      onValueChange={(v) =>
                        setMissionForm((f) => ({ ...f, category: v }))
                      }
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
                )}
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
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button
                    disabled={busyKey === 'create-mission'}
                    onClick={() =>
                      runAction('create-mission', async () => {
                        const category =
                          missionForm.missionKind === 'daily'
                            ? 'daily'
                            : missionForm.category;
                        await adminUpsertMissionTemplate({
                          id: missionForm.id || undefined,
                          key: missionForm.key,
                          title: missionForm.title,
                          description: missionForm.description,
                          rewardXp: missionForm.rewardXp,
                          targetCount: missionForm.targetCount,
                          metric: missionForm.metric,
                          category,
                          isActive: missionForm.isActive,
                          iconImageUrl: missionForm.iconImageUrl || undefined,
                        });
                        setMissionForm(emptyMissionForm);
                        toast({
                          title: missionForm.id ? 'Mission updated' : 'Mission created',
                        });
                        await reload();
                      })
                    }
                  >
                    {busyKey === 'create-mission' && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    {missionForm.id ? 'Save changes' : 'Create mission'}
                  </Button>
                  {missionForm.id && (
                    <Button
                      variant="outline"
                      onClick={() => setMissionForm(emptyMissionForm)}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {missions.map((m) => (
                <Card key={m.id} className="bg-slate-800/40 border-slate-700/30">
                  <CardContent className="py-3 flex justify-between gap-2 flex-wrap items-center">
                    <div className="flex items-center gap-3 min-w-0">
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
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setMissionForm({
                          id: m.id,
                          key: m.key,
                          title: m.title,
                          description: m.description,
                          rewardXp: m.rewardXp,
                          targetCount: m.targetCount,
                          metric: m.metric,
                          missionKind: m.category === 'daily' ? 'daily' : 'main',
                          category: m.category === 'daily' ? 'game' : m.category,
                          iconImageUrl: m.iconImageUrl || '',
                          isActive: m.isActive,
                        })
                      }
                    >
                      Edit
                    </Button>
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
                <CardTitle>
                  {achForm.id ? 'Edit achievement' : 'Add achievement'}
                </CardTitle>
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
                      <SelectItem value="cosmetics">Cosmetics</SelectItem>
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
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button
                    disabled={busyKey === 'create-achievement'}
                    onClick={() =>
                      runAction('create-achievement', async () => {
                        await adminUpsertAchievement({
                          ...achForm,
                          id: achForm.id || undefined,
                          iconImageUrl: achForm.iconImageUrl || undefined,
                        });
                        setAchForm(emptyAchForm);
                        toast({
                          title: achForm.id
                            ? 'Achievement updated'
                            : 'Achievement created',
                        });
                        await reload();
                      })
                    }
                  >
                    {busyKey === 'create-achievement' && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    {achForm.id ? 'Save changes' : 'Create achievement'}
                  </Button>
                  {achForm.id && (
                    <Button
                      variant="outline"
                      onClick={() => setAchForm(emptyAchForm)}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {achievements.map((a) => (
                <Card key={a.id} className="bg-slate-800/40 border-slate-700/30">
                  <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
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
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAchForm({
                          id: a.id,
                          key: a.key,
                          title: a.title,
                          description: a.description,
                          category: a.category,
                          metric: a.metric,
                          targetCount: a.targetCount,
                          xpReward: a.xpReward,
                          icon: a.icon || 'trophy',
                          iconImageUrl: a.iconImageUrl || '',
                          isActive: a.isActive,
                        })
                      }
                    >
                      Edit
                    </Button>
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
                <CardTitle>{badgeForm.id ? 'Edit badge' : 'Add badge'}</CardTitle>
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
                    Use &quot;manual&quot; for staff-only awards with no automatic unlock.
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
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button
                    disabled={busyKey === 'create-badge'}
                    onClick={() =>
                      runAction('create-badge', async () => {
                        await adminUpsertBadge({
                          ...badgeForm,
                          id: badgeForm.id || undefined,
                          iconImageUrl: badgeForm.iconImageUrl || undefined,
                        });
                        setBadgeForm(emptyBadgeForm);
                        toast({
                          title: badgeForm.id ? 'Badge updated' : 'Badge created',
                        });
                        await reload();
                      })
                    }
                  >
                    {busyKey === 'create-badge' && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    {badgeForm.id ? 'Save changes' : 'Create badge'}
                  </Button>
                  {badgeForm.id && (
                    <Button
                      variant="outline"
                      onClick={() => setBadgeForm(emptyBadgeForm)}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {badges.map((b) => (
                <Card key={b.id} className="bg-slate-800/40 border-slate-700/30">
                  <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
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
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setBadgeForm({
                          id: b.id,
                          key: b.key,
                          title: b.title,
                          description: b.description,
                          rarity: b.rarity,
                          icon: b.icon || 'award',
                          metric: b.metric,
                          targetCount: b.targetCount,
                          iconImageUrl: b.iconImageUrl || '',
                          isActive: b.isActive,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        <TabsContent value="support" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-slate-400">Status</Label>
            <Select
              value={ticketFilter}
              onValueChange={(v) => {
                setTicketFilter(v);
                void adminListTickets(v === 'all' ? undefined : v)
                  .then(setTickets)
                  .catch((err) => {
                    console.error(err);
                    toast({
                      title: 'Could not load tickets',
                      variant: 'destructive',
                    });
                  });
              }}
            >
              <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Card className="bg-slate-800/40 border-cyan-700/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4 text-cyan-300" />
                  Skins DB ready?
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-400 flex-1 min-w-[200px]">
                  Before publishing Model Editor skins, sync Prisma → Mongo once so{' '}
                  <code className="text-slate-300">equippedSkins</code> works. Same
                  action as Dashboard → Database schema sync.
                </p>
                <Button
                  variant="outline"
                  disabled={busyKey === 'schema-sync'}
                  onClick={() =>
                    runAction('schema-sync', async () => {
                      const result = await adminSyncDatabaseSchema();
                      toast({
                        title: 'Database schema synced',
                        description:
                          result.cliPush === 'ok'
                            ? 'prisma db push OK'
                            : `Verified · CLI ${result.cliPush}`,
                      });
                    })
                  }
                >
                  {busyKey === 'schema-sync' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Database className="h-4 w-4 mr-2" />
                  )}
                  Sync schema now
                </Button>
              </CardContent>
            </Card>

            <CosmeticsStudio onCreated={reload} />

            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-400" />
                  Fire Sale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-400">
                  Select catalog items below, set a discount and duration. Shop cards get a
                  fire badge, orange outline, and live countdown.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Discount %</Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={fireSaleForm.percent}
                      onChange={(e) =>
                        setFireSaleForm((f) => ({
                          ...f,
                          percent: Number(e.target.value) || 0,
                        }))
                      }
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Duration (hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={fireSaleForm.durationHours}
                      onChange={(e) =>
                        setFireSaleForm((f) => ({
                          ...f,
                          durationHours: Number(e.target.value) || 0,
                        }))
                      }
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Selected</Label>
                    <p className="h-10 flex items-center text-sm text-slate-300">
                      {fireSaleSelected.length} item
                      {fireSaleSelected.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      busyKey === 'fire-sale' || fireSaleSelected.length === 0
                    }
                    className="bg-orange-600 hover:bg-orange-500"
                    onClick={() =>
                      runAction('fire-sale', async () => {
                        const r = await adminSetFireSale({
                          itemIds: fireSaleSelected,
                          percent: fireSaleForm.percent,
                          durationHours: fireSaleForm.durationHours,
                        });
                        toast({
                          title: 'Fire sale live',
                          description: `${r.count} items · −${r.percent}%`,
                        });
                        setFireSaleSelected([]);
                        await reload();
                      })
                    }
                  >
                    {busyKey === 'fire-sale' && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    Start fire sale
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      busyKey === 'clear-fire-selected' ||
                      fireSaleSelected.length === 0
                    }
                    onClick={() =>
                      runAction('clear-fire-selected', async () => {
                        const r = await adminClearFireSale(fireSaleSelected);
                        toast({ title: `Cleared sale on ${r.count} items` });
                        setFireSaleSelected([]);
                        await reload();
                      })
                    }
                  >
                    Clear selected
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busyKey === 'clear-fire-all'}
                    onClick={() =>
                      runAction('clear-fire-all', async () => {
                        const r = await adminClearFireSale();
                        toast({ title: `Cleared ${r.count} fire sales` });
                        setFireSaleSelected([]);
                        await reload();
                      })
                    }
                  >
                    Clear all fire sales
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFireSaleSelected(
                        fireSaleSelected.length === items.length
                          ? []
                          : items.map((i) => i.id)
                      )
                    }
                  >
                    {fireSaleSelected.length === items.length
                      ? 'Deselect all'
                      : 'Select all'}
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                  <Select
                    value={itemForm.itemCategory}
                    onValueChange={(v) =>
                      setItemForm((f) => ({ ...f, itemCategory: v }))
                    }
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">
                    Banners, frames, and nickname effects are created in Cosmetics Studio
                    above. Body skins come from Map Editor → Model Editor, or pick a skin
                    slot below.
                  </p>
                </div>
                {itemForm.itemCategory === 'Skins' && (
                  <div className="space-y-1">
                    <Label>Skin slot</Label>
                    <Select
                      value={itemForm.cosmeticSlot}
                      onValueChange={(v) =>
                        setItemForm((f) => ({ ...f, cosmeticSlot: v }))
                      }
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SKIN_ATTACH_SLOTS.map((s) => (
                          <SelectItem key={s.cosmeticSlot} value={s.cosmeticSlot}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">
                      Hat, pants, boots, gloves, weapon, etc. — matches Model Editor slots.
                    </p>
                  </div>
                )}
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
                      if (itemForm.itemCategory === 'Skins') {
                        toast({
                          title: 'Skins need Model Editor publish',
                          description:
                            'Slot-only items have no mesh. Prefer Model Editor → Publish to shop so cosmeticConfig (attachments) is included.',
                        });
                      }
                      await adminUpsertStoreItem({
                        itemName: itemForm.itemName,
                        itemCategory: itemForm.itemCategory,
                        itemSku: itemForm.itemSku,
                        vpPrice: itemForm.vpPrice,
                        imageUrl: itemForm.imageUrl || undefined,
                        cosmeticSlot:
                          itemForm.itemCategory === 'Skins'
                            ? itemForm.cosmeticSlot
                            : null,
                      });
                      setItemForm({
                        itemName: '',
                        itemCategory: 'Skins',
                        itemSku: '',
                        vpPrice: 100,
                        imageUrl: '',
                        cosmeticSlot: 'skin_hat',
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
                const banner = item.bannerConfig
                  ? normalizeBannerConfig(item.bannerConfig)
                  : null;
                const onFire = isFireSaleActive(item);
                const salePrice = getEffectiveVpPrice(item);
                const checked = fireSaleSelected.includes(item.id);
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      'bg-slate-800/40 border-slate-700/30',
                      onFire &&
                        'border-orange-500/60 shadow-[0_0_0_1px_rgba(249,115,22,0.25)]'
                    )}
                  >
                    <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setFireSaleSelected((prev) =>
                              v
                                ? [...prev, item.id]
                                : prev.filter((id) => id !== item.id)
                            );
                          }}
                          aria-label={`Select ${item.itemName}`}
                        />
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
                          <p className="font-semibold truncate flex items-center gap-1.5 flex-wrap">
                            {item.itemName}
                            {item.cosmeticSlot && (
                              <Badge
                                variant="outline"
                                className="capitalize text-[10px]"
                              >
                                {item.cosmeticSlot}
                              </Badge>
                            )}
                            {onFire && (
                              <Badge className="bg-orange-600 text-[10px] gap-1">
                                <Flame className="h-3 w-3" />
                                −{item.fireSalePercent}%
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {item.itemSku} ·{' '}
                            {onFire ? (
                              <>
                                <span className="text-orange-400 font-semibold">
                                  {salePrice} VP
                                </span>{' '}
                                <span className="line-through">{item.vpPrice}</span>
                              </>
                            ) : (
                              <>{item.vpPrice} VP</>
                            )}{' '}
                            · {item.itemCategory}
                            {onFire && item.fireSaleEndsAt ? (
                              <>
                                {' '}
                                · ends in{' '}
                                {formatFireSaleCountdown(item.fireSaleEndsAt)}
                              </>
                            ) : null}
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
                            setFireSaleSelected((prev) =>
                              prev.filter((id) => id !== item.id)
                            );
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
          <TabsContent value="premium" className="mt-4">
            <AdminPremiumPanel />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="maps" className="mt-4">
            <AdminMapEditorPanel />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="content" className="mt-4 space-y-6">
            <AdminNewsPanel />

            <Card className="bg-slate-800/40 border-slate-700/30 max-w-xl">
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
