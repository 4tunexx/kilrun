/**
 * Built-in SFX pack: event key → bundled file under /game/sounds/.
 * Seed writes SoundDefinition rows for missing keys only; gameplay never
 * imports these filenames — it always plays via playSound(eventKey).
 */

export const SOUND_PACK_PUBLIC_DIR = '/game/sounds';

export interface DefaultSoundBinding {
  eventKey: string;
  /** Bundled kebab filename inside public/game/sounds/. */
  file: string;
  /** Original pack filename, shown in the Sound Board. */
  fileName: string;
}

/** Godot dump names → stable runtime kebab.mp3 (drops trailing dots, .import). */
export function packFilenameToBundled(original: string): string {
  const base = original.replace(/\.import$/i, '').replace(/\.mp3$/i, '').replace(/\.+$/, '');
  const kebab = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${kebab}.mp3`;
}

export function defaultSoundFileUrl(file: string): string {
  return `${SOUND_PACK_PUBLIC_DIR}/${file}`;
}

function bind(eventKey: string, original: string): DefaultSoundBinding {
  return { eventKey, file: packFilenameToBundled(original), fileName: original };
}

/** One row per Sound Board event that ships with a pack clip. */
export const DEFAULT_SOUND_BINDINGS: DefaultSoundBinding[] = [
  bind('music_menu', 'mainmenu-music.mp3'),
  bind('music_ingame', 'ingame-music.mp3'),
  bind('ui_click', 'press-menu.mp3'),
  bind('ui_hover', 'hover-over-any-menu-shop-etc.mp3'),
  bind('ui_error', 'not-coins-or-other-errors.mp3'),
  bind('ui_transition', 'Futuristic-swish-transition.mp3'),
  bind('power_denied', 'not-coins-or-other-errors.mp3'),

  bind('land', 'landing.mp3'),
  bind('double_jump', 'double-jump-sound.mp3'),
  bind('footstep', 'single-footstep.mp3'),
  bind('footstep_water', 'walking-water.mp3'),
  bind('sprint_start', 'running-fast.mp3'),
  bind('sprint_burst', 'fast-run.mp3'),
  bind('flip', 'press-b-backflip-sound.mp3'),
  bind('power_backflip', 'press-b-backflip-sound.mp3'),
  bind('energy_exhausted', 'run-out-of-energy.mp3'),
  bind('power_hook', 'graple-as-pressed.mp3'),

  bind('weapon_fire', 'pistol-shot.mp3'),
  bind('weapon_fire_pistol', 'pistol-shot.mp3'),
  bind('weapon_fire_rifle', 'smg-shoot.mp3'),
  bind('weapon_fire_smg', 'smg-shoot.mp3'),
  bind('weapon_fire_shotgun', 'shotgun-sound.mp3'),
  bind('weapon_fire_sniper', 'Sniper-rifle-single-shot.mp3'),
  bind('weapon_fire_revolver', 'revolver-sound.mp3'),
  bind('weapon_reload', 'pistol-reload.mp3'),
  bind('weapon_reload_pistol', 'pistol-reload.mp3'),
  bind('weapon_reload_rifle', 'rifle-reload.mp3'),
  bind('weapon_reload_shotgun', 'shotgun-reload.mp3'),
  bind('weapon_reload_sniper', 'Sniper-rifle-reload.mp3'),
  bind('weapon_empty', 'rifle-noammo.mp3'),
  bind('weapon_insert_mag', 'pistol-insert-mag.mp3'),
  bind('weapon_zoom', 'zoom-in-weapons.mp3'),
  bind('weapon_sniper_drop', 'sniper-shot-bullet-drop.mp3'),
  bind('melee_punch', 'knife-sound.mp3'),
  bind('melee_miss', 'knife-sound-missed.mp3'),

  bind('hit_dealt', 'Bullet-hit-body-impact.mp3'),
  bind('hit_taken', 'Bullet-hit-body-impact.mp3'),
  bind('hit_metal', 'Bullet-hit-on-metal.mp3'),
  bind('player_death', 'lazers-anything-kill-player-anythingelse..mp3'),
  bind('respawn', 'spawn-after-warmup.mp3'),
  bind('match_start', 'spawn-after-warmup.mp3'),

  bind('trap_trigger', 'some-metalgear-traps-activated-sound.mp3'),
  bind('trap_cut', 'trap-hit-cut-player.mp3'),
  bind('trap_crush', 'trap-crush-player.mp3'),
  bind('trap_small', 'small-metal-trap.mp3'),

  bind('monster_hit', 'some-monsters-cry.mp3'),
  bind('monster_death', 'Large-beast-monster-growling.mp3'),
  bind('monster_footstep', 'Large-beast-monster-footsteps.mp3'),
  bind('monster_fly', 'Insect-little-monster-flying-wings.mp3'),

  bind('purchase', 'pick-coins.mp3'),
  bind('pickup_health', 'picking-health-from-killing-monsters.mp3'),
  bind('level_up', 'level-up.mp3'),
  bind('chat_message', 'Notification-bell-delayed-ding.mp3'),
  bind('afk_warning', '30-sec-afk.mp3'),
  bind('afk_timeout', 'afk-50sec.mp3'),
];

export function packBindingForEvent(eventKey: string): DefaultSoundBinding | undefined {
  return DEFAULT_SOUND_BINDINGS.find((b) => b.eventKey === eventKey);
}

export type PackSoundRow = {
  eventKey: string;
  fileUrl: string;
  fileName: string;
  volume: number;
};

/** Fill missing event keys from the bundled pack. Existing DB rows win. */
export function applyPackDefaults<T extends PackSoundRow>(rows: T[]): T[] {
  const byKey = new Map(rows.map((r) => [r.eventKey, r]));
  for (const b of DEFAULT_SOUND_BINDINGS) {
    if (byKey.has(b.eventKey)) continue;
    byKey.set(b.eventKey, {
      eventKey: b.eventKey,
      fileUrl: defaultSoundFileUrl(b.file),
      fileName: b.fileName,
      volume: 1,
    } as T);
  }
  return Array.from(byKey.values());
}
