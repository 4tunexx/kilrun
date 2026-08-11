export type GuideCategoryDef = {
  id: string;
  label: string;
  /** lucide-react icon name, resolved by consumers via a lookup map */
  icon: string;
  description: string;
  accent: string;
};

/** Canonical guide categories spanning the website and the in-game experience. */
export const GUIDE_CATEGORIES: GuideCategoryDef[] = [
  { id: 'getting-started', label: 'Getting Started', icon: 'Rocket', description: 'New to Kilrun? Start here.', accent: 'text-sky-400 border-sky-500/40' },
  { id: 'account-security', label: 'Account & Security', icon: 'ShieldCheck', description: 'Logins, 2FA, Steam linking, recovery.', accent: 'text-emerald-400 border-emerald-500/40' },
  { id: 'gameplay-basics', label: 'Gameplay Basics', icon: 'Gamepad2', description: 'Core rules, objectives, controls.', accent: 'text-lime-400 border-lime-500/40' },
  { id: 'movement-tech', label: 'Movement Tech', icon: 'Wind', description: 'Bhop, wall-run, sliding, advanced tech.', accent: 'text-cyan-400 border-cyan-500/40' },
  { id: 'maps', label: 'Maps', icon: 'Map', description: 'Map callouts, routes, shortcuts.', accent: 'text-teal-400 border-teal-500/40' },
  { id: 'weapons-loadouts', label: 'Weapons & Loadouts', icon: 'Crosshair', description: 'Weapon stats, best loadouts.', accent: 'text-orange-400 border-orange-500/40' },
  { id: 'powers-abilities', label: 'Powers & Abilities', icon: 'Sparkles', description: 'Ability cooldowns and combos.', accent: 'text-fuchsia-400 border-fuchsia-500/40' },
  { id: 'ranked-competitive', label: 'Ranked & Competitive', icon: 'Trophy', description: 'Ranks, KP, matchmaking, seasons.', accent: 'text-yellow-400 border-yellow-500/40' },
  { id: 'clans-teams', label: 'Clans & Teams', icon: 'Users', description: 'Creating clans, roles, team play.', accent: 'text-indigo-400 border-indigo-500/40' },
  { id: 'crates-cosmetics', label: 'Crates & Cosmetics', icon: 'Gift', description: 'Unboxing, rarities, skins.', accent: 'text-pink-400 border-pink-500/40' },
  { id: 'store-economy', label: 'Store & Economy', icon: 'Coins', description: 'VP, pricing, fire sales, trading.', accent: 'text-amber-400 border-amber-500/40' },
  { id: 'progression-xp', label: 'Progression & XP', icon: 'BarChart3', description: 'Leveling, XP sources, prestige.', accent: 'text-violet-400 border-violet-500/40' },
  { id: 'missions-events', label: 'Missions & Events', icon: 'CalendarClock', description: 'Daily missions, limited events.', accent: 'text-rose-400 border-rose-500/40' },
  { id: 'anticheat-fairplay', label: 'Anti-Cheat & Fair Play', icon: 'ShieldAlert', description: 'Pulsar anti-cheat, reporting cheaters.', accent: 'text-red-400 border-red-500/40' },
  { id: 'community-social', label: 'Community & Social', icon: 'MessageSquare', description: 'Chat, friends, forums, profiles.', accent: 'text-blue-400 border-blue-500/40' },
  { id: 'map-editor', label: 'Map Editor', icon: 'PencilRuler', description: 'Building and publishing custom maps.', accent: 'text-purple-400 border-purple-500/40' },
  { id: 'moderation-support', label: 'Moderation & Support', icon: 'LifeBuoy', description: 'Tickets, bans, appeals, staff.', accent: 'text-slate-300 border-slate-500/40' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: 'Wrench', description: 'Common fixes and known issues.', accent: 'text-stone-400 border-stone-500/40' },
];

export const GUIDE_CATEGORY_IDS = GUIDE_CATEGORIES.map((c) => c.id);

export function getGuideCategory(id: string): GuideCategoryDef {
  return (
    GUIDE_CATEGORIES.find((c) => c.id === id) ?? {
      id,
      label: id,
      icon: 'BookOpen',
      description: '',
      accent: 'text-slate-300 border-slate-500/40',
    }
  );
}
