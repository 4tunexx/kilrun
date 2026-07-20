/**
 * Shared Kilrun game-mode catalog used by Play hub, Map Editor, and progression.
 */

export type KilrunMode = 'deathrun' | 'horde' | 'competitive';

export const KILRUN_MODES: KilrunMode[] = ['deathrun', 'horde', 'competitive'];

export interface KilrunModeInfo {
  id: KilrunMode;
  title: string;
  shortTitle: string;
  description: string;
  players: string;
  /** Map-editor focused blurb */
  editorBlurb: string;
  accentClass: string;
  badgeClass: string;
}

export const KILRUN_MODE_INFO: Record<KilrunMode, KilrunModeInfo> = {
  deathrun: {
    id: 'deathrun',
    title: 'Deathrun',
    shortTitle: 'Deathrun',
    description:
      'Platformer Deathrun: jump floating pads, dodge traps, manage Energy. One player may become the Trapper — runners race the course to the finish.',
    players: 'Up to 8',
    editorBlurb: 'Course, traps, Start/Finish, Trapper spawn, buttons & hazards.',
    accentClass: 'from-orange-500/20 to-cyan-500/20 border-orange-500/40',
    badgeClass: 'bg-orange-600/80',
  },
  horde: {
    id: 'horde',
    title: 'Horde Mode',
    shortTitle: 'Horde',
    description:
      'Up to 4 players clear escalating waves of enemies. Survive, revive teammates, and push through harder waves.',
    players: '1–4 co-op',
    editorBlurb: 'Monster spawns, red zones, health floors, revive pads, player spawns.',
    accentClass: 'from-rose-500/20 to-amber-500/20 border-rose-500/40',
    badgeClass: 'bg-rose-600/80',
  },
  competitive: {
    id: 'competitive',
    title: 'Competitive 4v4',
    shortTitle: 'Competitive',
    description:
      '4v4 · six rounds. Casual keeps XP/KD only. Ranked (Premium) moves Killrun Points (KP) Elo.',
    players: '4v4 · 6 rounds',
    editorBlurb: 'Team A / Team B spawns, arena solids, cover props.',
    accentClass: 'from-sky-500/20 to-indigo-500/20 border-sky-500/40',
    badgeClass: 'bg-sky-600/80',
  },
};

export function isKilrunMode(value: unknown): value is KilrunMode {
  return value === 'deathrun' || value === 'horde' || value === 'competitive';
}

export function normalizeKilrunMode(value: unknown): KilrunMode {
  return isKilrunMode(value) ? value : 'deathrun';
}
