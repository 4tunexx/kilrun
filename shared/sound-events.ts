/**
 * Canonical catalog of every sound-triggering event in the game engine.
 * Pure data — no Prisma/Next.js/Colyseus imports — so it's safe to import
 * from both the client (Sound Board dropdown, playback lookup) and the
 * Colyseus server (nothing here touches gameplay logic, but keeping the
 * event KEYS as the single source of truth avoids the client and any
 * future server-side trigger code drifting apart on event names).
 *
 * The catalog itself (labels/categories) lives in code. The DB
 * (`SoundDefinition` model) only stores which uploaded file, if any, is
 * bound to each event key — see src/lib/sound-definitions.ts.
 */

export type SoundEventCategory = 'Movement' | 'Combat' | 'Powers' | 'Kill Streaks' | 'UI & Match';

export interface SoundEventDef {
  key: string;
  label: string;
  category: SoundEventCategory;
  description?: string;
}

export const SOUND_EVENTS: SoundEventDef[] = [
  // --- Movement -------------------------------------------------------
  { key: 'jump', label: 'Jump', category: 'Movement' },
  { key: 'double_jump', label: 'Double Jump', category: 'Movement' },
  { key: 'wall_jump', label: 'Wall Jump', category: 'Movement' },
  { key: 'land', label: 'Landing', category: 'Movement' },
  { key: 'footstep', label: 'Footstep', category: 'Movement' },
  { key: 'sprint_start', label: 'Sprint Start', category: 'Movement' },
  { key: 'slide', label: 'Slide', category: 'Movement' },
  { key: 'flip', label: 'Back Flip', category: 'Movement' },
  { key: 'crouch', label: 'Crouch', category: 'Movement' },
  { key: 'energy_exhausted', label: 'Energy Exhausted', category: 'Movement' },

  // --- Combat -----------------------------------------------------------
  { key: 'weapon_fire', label: 'Weapon Fire', category: 'Combat' },
  { key: 'weapon_reload', label: 'Weapon Reload', category: 'Combat' },
  { key: 'weapon_empty', label: 'Weapon Empty (dry fire)', category: 'Combat' },
  { key: 'melee_punch', label: 'Melee Punch', category: 'Combat' },
  { key: 'hit_dealt', label: 'Hit Dealt (damage number pop)', category: 'Combat' },
  { key: 'hit_taken', label: 'Hit Taken', category: 'Combat' },
  { key: 'player_death', label: 'Player Death', category: 'Combat' },
  { key: 'respawn', label: 'Respawn', category: 'Combat' },
  { key: 'monster_hit', label: 'Monster Hit', category: 'Combat' },
  { key: 'monster_death', label: 'Monster Death', category: 'Combat' },
  { key: 'checkpoint', label: 'Checkpoint Reached', category: 'Combat' },
  { key: 'finish_line', label: 'Finish Line', category: 'Combat' },
  { key: 'button_press', label: 'Button Press', category: 'Combat' },
  { key: 'teleport', label: 'Teleport', category: 'Combat' },
  { key: 'trap_trigger', label: 'Trap / Hazard Triggered', category: 'Combat' },
  { key: 'void_fall', label: 'Void Fall (death by falling out of bounds)', category: 'Combat' },

  // --- Powers -------------------------------------------------------
  { key: 'power_hook', label: 'Power: Grapple Hook', category: 'Powers' },
  { key: 'power_fly', label: 'Power: Fly', category: 'Powers' },
  { key: 'power_berserk', label: 'Power: Berserk', category: 'Powers' },
  { key: 'power_thunder', label: 'Power: Thunder Bolt', category: 'Powers' },
  { key: 'power_visibility', label: 'Power: Invisibility', category: 'Powers' },
  { key: 'power_bullet', label: 'Power: Unlimited Ammo', category: 'Powers' },
  { key: 'power_backflip', label: 'Power: Backflip', category: 'Powers' },
  { key: 'power_ready', label: 'Power Ready (cooldown finished)', category: 'Powers' },
  { key: 'power_denied', label: 'Power Denied (on cooldown / no energy)', category: 'Powers' },

  // --- Kill Streaks & Multi-Kill ---------------------------------------
  { key: 'streak_first_blood', label: 'Streak: First Blood', category: 'Kill Streaks' },
  { key: 'streak_double_kill', label: 'Streak: Double Kill', category: 'Kill Streaks' },
  { key: 'streak_triple_kill', label: 'Streak: Triple Kill', category: 'Kill Streaks' },
  { key: 'streak_multi_kill', label: 'Streak: Multi Kill', category: 'Kill Streaks' },
  { key: 'streak_mega_kill', label: 'Streak: Mega Kill', category: 'Kill Streaks' },
  { key: 'streak_monster_kill', label: 'Streak: Monster Kill', category: 'Kill Streaks' },
  { key: 'streak_unstoppable', label: 'Streak: Unstoppable', category: 'Kill Streaks' },
  { key: 'streak_rampage', label: 'Streak: Rampage', category: 'Kill Streaks' },
  { key: 'multi_kill_combo', label: 'Multi-Kill Combo (rapid succession)', category: 'Kill Streaks' },

  // --- UI & Match -------------------------------------------------------
  { key: 'ui_click', label: 'UI Click', category: 'UI & Match' },
  { key: 'level_up', label: 'Level Up', category: 'UI & Match' },
  { key: 'skill_point_spent', label: 'Skill Point Spent (power upgraded)', category: 'UI & Match' },
  { key: 'purchase', label: 'Shop Purchase', category: 'UI & Match' },
  { key: 'match_countdown_tick', label: 'Countdown Tick', category: 'UI & Match' },
  { key: 'match_start', label: 'Match Start', category: 'UI & Match' },
  { key: 'match_end', label: 'Match End / Results', category: 'UI & Match' },
  { key: 'chat_message', label: 'Chat Message Received', category: 'UI & Match' },
];

export function getSoundEventDef(key: string): SoundEventDef | null {
  return SOUND_EVENTS.find((e) => e.key === key) ?? null;
}

export function getSoundEventCategories(): SoundEventCategory[] {
  const seen: SoundEventCategory[] = [];
  for (const e of SOUND_EVENTS) if (!seen.includes(e.category)) seen.push(e.category);
  return seen;
}
