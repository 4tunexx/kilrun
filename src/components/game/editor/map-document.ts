import type { SkinAttachment } from '@/lib/player-skins';
import type { KilrunMode } from '@/lib/game-modes';
import { normalizeKilrunMode } from '@/lib/game-modes';
import type {
  TpsCameraSettings,
  TpsCrosshairSettings,
  TpsPlayerViewSettings,
} from '../tps/tps-view-settings';

export type { KilrunMode };

export type EditorEntityKind =
  | 'prop'
  | 'spawn_runner'
  | 'spawn_trapper'
  | 'start'
  | 'finish'
  | 'checkpoint'
  | 'hazard'
  | 'trap'
  | 'group'
  | 'player'
  | 'button'
  | 'light'
  | 'door'
  | 'jump_pad'
  | 'action'
  // Horde
  | 'spawn_monster'
  | 'red_zone'
  | 'revive_pad'
  | 'health_floor'
  | 'wave_anchor'
  // Competitive
  | 'spawn_team_a'
  | 'spawn_team_b';

/** Built-in Hammer++ solid box (no GLB) — resize with Scale, paint textures. */
export const HAMMER_SOLID_MODEL = 'hammer-solid';

/**
 * Invisible gameplay markers — shown as flags/cones in the editor only.
 * Never rendered in Play Test or live match.
 */
export const INVISIBLE_MARKER_KINDS: EditorEntityKind[] = [
  'start',
  'spawn_runner',
  'spawn_trapper',
  'spawn_monster',
  'spawn_team_a',
  'spawn_team_b',
  'wave_anchor',
  'action',
  'checkpoint',
];

export function isInvisibleMarkerKind(kind: EditorEntityKind): boolean {
  return INVISIBLE_MARKER_KINDS.includes(kind);
}

/** Hammer++ solid box (no catalog GLB) — material + size authoring only. */
export function isHammerSolidEntity(ent: Pick<EditorEntity, 'model' | 'primitive'>): boolean {
  return ent.primitive === 'box' || ent.model === HAMMER_SOLID_MODEL;
}

/**
 * Player avatar is platform-wide look/settings (Player Model studio), not a placeable map prop.
 * Kept in the document for Play Test / match, but never shown as a mesh in the map viewport.
 */
export function isPlatformPlayerKind(kind: EditorEntityKind): boolean {
  return kind === 'player';
}

/** Whether Properties should offer Model / GLB upload for this entity. */
export function entityShowsModelPicker(ent: Pick<EditorEntity, 'kind' | 'model' | 'primitive'>): boolean {
  if (isPlatformPlayerKind(ent.kind)) return false;
  if (isInvisibleMarkerKind(ent.kind)) return false;
  if (isHammerSolidEntity(ent)) return false;
  if (ent.kind === 'light') return false;
  if (ent.kind === 'action' || ent.kind === 'checkpoint' || ent.kind === 'wave_anchor') return false;
  return true;
}

/** Whether Properties should offer Material / jump pad / conveyor gameplay block. */
export function entityShowsGameplayMaterial(
  ent: Pick<EditorEntity, 'kind' | 'model' | 'primitive'>
): boolean {
  if (isPlatformPlayerKind(ent.kind)) return false;
  if (isInvisibleMarkerKind(ent.kind)) return false;
  if (ent.kind === 'light') return false;
  if (ent.kind === 'spawn_team_a' || ent.kind === 'spawn_team_b' || ent.kind === 'spawn_monster') {
    return false;
  }
  return true;
}

/** Monster spawn authoring for Horde maps. */
export interface EntityMonsterSpawn {
  /** basic | fast | brute | boss */
  monsterType: 'basic' | 'fast' | 'brute' | 'boss';
  /** First wave this spawn is active (1-based). */
  waveMin: number;
  /** Last wave inclusive; 0 = infinite. */
  waveMax: number;
  /** How many monsters from this point each eligible wave. */
  countPerWave: number;
  /** Seconds between spawns within a wave pulse. */
  spawnIntervalSec: number;
}

/** Red / kill zone — damages players standing inside (Horde). */
export interface EntityRedZone {
  damagePerTick: number;
  intervalMs: number;
  instantKill: boolean;
}

/** Revive pad — downed teammates can be revived here. */
export interface EntityRevive {
  reviveTimeMs: number;
  /** Max simultaneous revives. */
  capacity: number;
}

/** Health floor — standing here regenerates HP. */
export interface EntityHealthFloor {
  healPerTick: number;
  intervalMs: number;
  /** Optional cap — stop healing above this HP percent (0–100). 0 = no cap. */
  maxHealPercent: number;
}

/** Wave anchor — region used for wave scripting / difficulty scaling. */
export interface EntityWaveAnchor {
  waveNumber: number;
  difficultyMultiplier: number;
  label?: string;
}

export function defaultMonsterSpawn(): EntityMonsterSpawn {
  return {
    monsterType: 'basic',
    waveMin: 1,
    waveMax: 0,
    countPerWave: 2,
    spawnIntervalSec: 1.5,
  };
}

export function ensureMonsterSpawn(ent: EditorEntity): EntityMonsterSpawn {
  return { ...defaultMonsterSpawn(), ...ent.monsterSpawn };
}

export function defaultRedZone(): EntityRedZone {
  return { damagePerTick: 15, intervalMs: 500, instantKill: false };
}

export function ensureRedZone(ent: EditorEntity): EntityRedZone {
  return { ...defaultRedZone(), ...ent.redZone };
}

export function defaultRevive(): EntityRevive {
  return { reviveTimeMs: 4000, capacity: 1 };
}

export function ensureRevive(ent: EditorEntity): EntityRevive {
  return { ...defaultRevive(), ...ent.revive };
}

export function defaultHealthFloor(): EntityHealthFloor {
  return { healPerTick: 8, intervalMs: 500, maxHealPercent: 100 };
}

export function ensureHealthFloor(ent: EditorEntity): EntityHealthFloor {
  return { ...defaultHealthFloor(), ...ent.healthFloor };
}

export function defaultWaveAnchor(): EntityWaveAnchor {
  return { waveNumber: 1, difficultyMultiplier: 1 };
}

export function ensureWaveAnchor(ent: EditorEntity): EntityWaveAnchor {
  return { ...defaultWaveAnchor(), ...ent.waveAnchor };
}

export type SkyPreset = 'cavern' | 'dusk' | 'bright' | 'void' | 'custom';
export type FloorPreset = 'grid' | 'void' | 'solid' | 'water';

/** How a prop/door/button animation starts. */
export type AnimTrigger =
  | 'none'
  | 'always'
  | 'proximity'
  | 'interact'
  | 'collide'
  | 'signal';

/**
 * Player locomotion / life slots → clip names from the model's animation list.
 * Leave a slot empty to fall back / stay on idle.
 */
export type PlayerAnimSlot =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'land'
  | 'crouch'
  | 'strafe_left'
  | 'strafe_right'
  | 'back'
  | 'die'
  | 'attack'
  | 'punch';

export const PLAYER_ANIM_SLOTS: { id: PlayerAnimSlot; label: string; hint?: string }[] = [
  { id: 'idle', label: 'Idle', hint: 'Standing still' },
  { id: 'walk', label: 'Walk / Forward', hint: 'Moving forward' },
  { id: 'run', label: 'Run / Sprint', hint: 'Sprint held' },
  { id: 'jump', label: 'Jump', hint: 'Leaving the ground' },
  { id: 'fall', label: 'Fall / Air', hint: 'In air, not jumping up' },
  { id: 'land', label: 'Land', hint: 'Touching down after a fall' },
  { id: 'crouch', label: 'Crouch', hint: 'Ctrl / C held' },
  { id: 'strafe_left', label: 'Strafe Left (A)' },
  { id: 'strafe_right', label: 'Strafe Right (D)' },
  { id: 'back', label: 'Walk Back (S)' },
  { id: 'attack', label: 'Attack / Swing', hint: 'Weapon swing or shoot pose' },
  { id: 'punch', label: 'Punch / Unarmed', hint: 'Fallback when no weapon' },
  { id: 'die', label: 'Die / Eliminated', hint: 'Plays once on death' },
];

export type PlayerAnimBindings = Partial<Record<PlayerAnimSlot, string>>;

/** Per-mesh / per-bone visual tweaks from Player Model studio. */
export interface PlayerMeshEdits {
  /** Mesh object name → hex color */
  meshColors?: Record<string, string>;
  /** Mesh object name → local scale xyz */
  meshScales?: Record<string, [number, number, number]>;
  /** Bone name → local scale xyz (round / squeeze body parts) */
  boneScales?: Record<string, [number, number, number]>;
}

export interface PlayerExtraBone {
  name: string;
  parentName: string;
  position: [number, number, number];
}

export interface PlayerAuthoredTrack {
  boneName: string;
  property: 'quaternion' | 'position' | 'scale';
  times: number[];
  values: number[];
}

/** Bone-recorded animation clip (Player Model studio timeline). */
export interface PlayerAuthoredClip {
  name: string;
  duration: number;
  tracks: PlayerAuthoredTrack[];
}

/** Fuzzy-match clip names into locomotion / life slots. */
export function suggestPlayerBindings(clips: string[]): PlayerAnimBindings {
  if (!clips.length) return {};
  const lower = clips.map((c) => ({ c, l: c.toLowerCase() }));
  const find = (...keys: string[]) =>
    lower.find((x) => keys.some((k) => x.l.includes(k)))?.c;
  const idle = find('idle', 'stand', 'breath') ?? clips[0];
  const walk = find('walk', 'walking') ?? find('run') ?? clips[1] ?? clips[0];
  return {
    idle,
    walk,
    run: find('run', 'sprint', 'running') ?? walk,
    jump: find('jump', 'hop', 'leap') ?? idle,
    fall: find('fall', 'air', 'falling') ?? find('jump') ?? idle,
    land: find('land', 'landing') ?? idle,
    crouch: find('crouch', 'sneak', 'duck') ?? idle,
    strafe_left: find('left', 'strafe_l', 'strafe left') ?? walk,
    strafe_right: find('right', 'strafe_r', 'strafe right') ?? walk,
    back: find('back', 'backward', 'reverse') ?? walk,
    attack: find('attack', 'slash', 'swing', 'shoot', 'fire', 'punch', 'hit') ?? idle,
    punch: find('punch', 'hit', 'jab', 'melee') ?? find('attack', 'slash') ?? idle,
    die: find('die', 'death', 'dead', 'elim') ?? idle,
  };
}

/** First player avatar entity on the map (if any). */
export function findPlayerEntity(doc: MapDocument): EditorEntity | undefined {
  return doc.entities.find((e) => e.kind === 'player');
}

export interface EntityAnimation {
  /** Clip names discovered from the GLB (auto-filled when model loads). */
  availableClips: string[];
  /** Rest / closed / idle clip */
  defaultClip?: string;
  /** Clip played when triggered (open, activate, etc.) */
  activeClip?: string;
  trigger: AnimTrigger;
  /** For proximity / collide / interact range (world units) */
  radius: number;
  /** Loop the active clip (doors often false = play once & hold) */
  loopActive: boolean;
  /** Loop the default clip when idle */
  loopDefault: boolean;
  /** If trigger === 'signal', which button entity id fires us */
  listenToEntityId?: string;
  /** If this is a button, entities that listen can reference this id */
  signalChannel?: string;
  /**
   * Button → traps/doors: entity ids this button activates when pressed.
   * Also auto-wires their listenToEntityId when set from the UI.
   */
  activatesEntityIds?: string[];
}

/** Touch / death-zone damage (kind hazard, or any entity with hazard enabled). */
export interface EntityHazard {
  enabled: boolean;
  /** HP removed each interval while touching */
  damage: number;
  /**
   * Always-on: cooldown between damage ticks.
   * Timed: ms the trap stays OFF before next pulse.
   */
  intervalMs: number;
  /** If true, touching instantly kills / max damage */
  instantKill: boolean;
  /**
   * always = permanent damage volume
   * timed = auto pulse on/off
   * button = starts off; activated by a wired Button
   */
  mode?: 'always' | 'timed' | 'button';
  /** Timed / button: how long the trap stays ON (ms). */
  activeMs?: number;
  /** Visual / net obstacle kind */
  obstacleKind?: 'spike' | 'saw' | 'laser' | 'crusher' | 'damage';
}

/** Launch player upward when they land / stand on this pad. */
export interface EntityJumpPad {
  enabled: boolean;
  /** Vertical launch speed (sim vz). Default ~14. */
  boost: number;
}

/** How the player collides / moves on this mesh (properties Material dropdown). */
export type EntityCollideMaterial =
  | 'solid'
  | 'water'
  | 'sand'
  | 'ice'
  | 'walkthrough';

/** Walkable surface modifiers (ice / conveyor). */
export interface EntitySurface {
  /** Low friction — slippery. */
  ice?: boolean;
  /** Push the player while standing on this pad. */
  conveyor?: boolean;
  /** Push speed in world units / second. */
  conveyorSpeed?: number;
}

/** Teleport pad — touching sends the player to the linked target. */
export interface EntityTeleport {
  enabled: boolean;
  /** Other entity id (teleporter exit / marker). */
  targetEntityId?: string;
  cooldownMs?: number;
}

/**
 * Prop interaction — play animation + optional damage / push when the player touches.
 * Shown on props / traps / doors so rotating hazards can hurt or shove.
 */
export interface EntityInteract {
  /** Play active animation while colliding / on trigger. */
  playAnimationOnTouch?: boolean;
  /** Damage the player on touch (mirrors hazard.enabled for quick authoring). */
  damageOnTouch?: boolean;
  /** Horizontal shove when the player touches this object. */
  pushPlayer?: boolean;
  /** Push strength in world units / second. */
  pushStrength?: number;
}

/** Point light for map atmosphere (client visual; not simulated). */
export interface EntityLight {
  color: string;
  intensity: number;
  /** Attenuation distance in world units */
  distance: number;
  castShadow?: boolean;
}

export interface EditorEntity {
  id: string;
  name: string;
  kind: EditorEntityKind;
  model?: string;
  /** Custom uploaded model URL (data URL or /uploads path) */
  customModelUrl?: string;
  layerId: string;
  groupId?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color?: string;
  opacity?: number;
  visible?: boolean;
  textureUrl?: string;
  /**
   * UV tiling for entity texture (default [1,1]). Use with Hammer++ solids /
   * floors so textures are not stretched.
   */
  textureRepeat?: [number, number];
  /** UV offset in texture units (default [0,0]). */
  textureOffset?: [number, number];
  /** UV rotation in radians (default 0). */
  textureRotation?: number;
  /**
   * Built-in solid box (Hammer++) — no GLB. Size comes from scale × unit box
   * and `collisionSize` for match export.
   */
  primitive?: 'box';
  /**
   * Cached local-space mesh half-extents / size from the loaded GLB (editor).
   * Used for collision pad export so stairs/walls match visual size.
   * `[sizeX, sizeY, sizeZ]` in local units before entity.scale.
   */
  collisionSize?: [number, number, number];
  animation?: EntityAnimation;
  /** Only for kind === 'player' */
  playerAnims?: PlayerAnimBindings;
  /**
   * Model Editor skin attachments (hat, pants, weapon, …) authored against
   * this player mesh — shown in Play Test / match when set on the avatar.
   */
  playerSkins?: SkinAttachment[];
  /** Body mesh color / scale tweaks from Player Model studio. */
  playerMeshEdits?: PlayerMeshEdits;
  /** Extra helper bones added in Player Model studio. */
  playerExtraBones?: PlayerExtraBone[];
  /** Authored animation clips recorded from bone posing. */
  playerAuthoredClips?: PlayerAuthoredClip[];
  /** Death zone / damage on touch */
  hazard?: EntityHazard;
  /**
   * Explicit standable collider for match export.
   * When true, entity becomes a server platform pad (top-plane AABB).
   */
  solid?: boolean;
  /**
   * Material dropdown — solid / water / sand / ice / walkthrough.
   * When set, drives collision export (wins over bare `solid` heuristics).
   */
  collideMaterial?: EntityCollideMaterial;
  /** Bounce / launch pad gameplay */
  jumpPad?: EntityJumpPad;
  /** Ice / conveyor surface */
  surface?: EntitySurface;
  /** Teleport pad */
  teleport?: EntityTeleport;
  /** kind === 'light' settings */
  light?: EntityLight;
  /** kind === 'spawn_monster' */
  monsterSpawn?: EntityMonsterSpawn;
  /** kind === 'red_zone' */
  redZone?: EntityRedZone;
  /** kind === 'revive_pad' */
  revive?: EntityRevive;
  /** kind === 'health_floor' */
  healthFloor?: EntityHealthFloor;
  /** kind === 'wave_anchor' */
  waveAnchor?: EntityWaveAnchor;
  /** Prop / trap / door touch interaction (damage, push, anim). */
  interact?: EntityInteract;
}

export interface EditorLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

export interface MapEnvironment {
  sky: SkyPreset;
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  floor: FloorPreset;
  floorColor: string;
  defaultTextureUrl?: string;
  /** Equirectangular / panoramic sky image (data URL or http). */
  skyTextureUrl?: string;
  /** Soft horizon tint blended into fog. */
  horizonColor?: string;
  /** Hemisphere / ambient fill (0–2). */
  ambientIntensity?: number;
  /** Key light strength (0–4). */
  sunIntensity?: number;
  sunColor?: string;
  /** Optional ground texture repeat tiling. */
  floorTextureScale?: number;
}

/** Embedded 3rd-person view override (from 3rd View tool). Shape matches tps-view-settings. */
export type MapTpsView = {
  version?: 1;
  camera?: Partial<TpsCameraSettings>;
  crosshair?: Partial<TpsCrosshairSettings>;
  player?: Partial<TpsPlayerViewSettings>;
};

/** Deathrun match timing / flow (Settings tab). */
export interface DeathrunModeSettings {
  warmupSec: number;
  roundTimeSec: number;
  /** Max runners that can spawn (place that many Runner Spawn entities). */
  maxRunners: number;
  trapperEnabled: boolean;
}

/** Horde match timing / wave flow (Settings tab). */
export interface HordeModeSettings {
  warmupSec: number;
  waveTimeSec: number;
  /** Seconds between waves. */
  intermissionSec: number;
  maxPlayers: number;
  startingWave: number;
}

/** Competitive match timing / rounds (Settings tab). */
export interface CompetitiveModeSettings {
  warmupSec: number;
  buyTimeSec: number;
  roundTimeSec: number;
  roundCount: number;
  overtimeSec: number;
}

export interface MapModeSettings {
  deathrun?: Partial<DeathrunModeSettings>;
  horde?: Partial<HordeModeSettings>;
  competitive?: Partial<CompetitiveModeSettings>;
}

export const DEFAULT_DEATHRUN_SETTINGS: DeathrunModeSettings = {
  warmupSec: 10,
  roundTimeSec: 180,
  maxRunners: 8,
  trapperEnabled: true,
};

export const DEFAULT_HORDE_SETTINGS: HordeModeSettings = {
  warmupSec: 8,
  waveTimeSec: 90,
  intermissionSec: 12,
  maxPlayers: 4,
  startingWave: 1,
};

export const DEFAULT_COMPETITIVE_SETTINGS: CompetitiveModeSettings = {
  warmupSec: 15,
  buyTimeSec: 20,
  roundTimeSec: 120,
  roundCount: 6,
  overtimeSec: 60,
};

export function ensureDeathrunSettings(doc: MapDocument): DeathrunModeSettings {
  return { ...DEFAULT_DEATHRUN_SETTINGS, ...doc.modeSettings?.deathrun };
}

export function ensureHordeSettings(doc: MapDocument): HordeModeSettings {
  return { ...DEFAULT_HORDE_SETTINGS, ...doc.modeSettings?.horde };
}

export function ensureCompetitiveSettings(doc: MapDocument): CompetitiveModeSettings {
  return { ...DEFAULT_COMPETITIVE_SETTINGS, ...doc.modeSettings?.competitive };
}

export function defaultInteract(): EntityInteract {
  return {
    playAnimationOnTouch: false,
    damageOnTouch: false,
    pushPlayer: false,
    pushStrength: 8,
  };
}

export function ensureInteract(ent: EditorEntity): EntityInteract {
  return { ...defaultInteract(), ...ent.interact };
}

export interface MapDocument {
  version: 1;
  name: string;
  /**
   * Which game mode this map is authored for.
   * Older maps without this field are treated as deathrun.
   */
  gameMode?: KilrunMode;
  gridSize: number;
  layers: EditorLayer[];
  entities: EditorEntity[];
  environment?: MapEnvironment;
  /** Optional per-map 3rd-person camera / crosshair / player framing. */
  tpsView?: MapTpsView;
  /** Per-mode match settings (warmup, round/wave times, spawn caps). */
  modeSettings?: MapModeSettings;
  meta?: { createdAt?: string; updatedAt?: string };
}

export function getMapGameMode(doc: MapDocument | null | undefined): KilrunMode {
  return normalizeKilrunMode(doc?.gameMode);
}

export const DEFAULT_ENVIRONMENT: MapEnvironment = {
  sky: 'cavern',
  skyColor: '#0a1220',
  fogColor: '#0c1830',
  fogDensity: 0.022,
  floor: 'grid',
  floorColor: '#1a2740',
  ambientIntensity: 0.55,
  sunIntensity: 1.15,
  sunColor: '#fff4e0',
  floorTextureScale: 40,
};

export function defaultAnimation(): EntityAnimation {
  return {
    availableClips: [],
    trigger: 'none',
    radius: 2.5,
    loopActive: false,
    loopDefault: true,
    activatesEntityIds: [],
  };
}

export function defaultHazard(): EntityHazard {
  return {
    enabled: true,
    damage: 25,
    intervalMs: 500,
    instantKill: false,
    mode: 'always',
    activeMs: 1000,
    obstacleKind: 'damage',
  };
}

export function ensureHazard(ent: EditorEntity): EntityHazard {
  const base =
    ent.kind === 'hazard' && !ent.hazard
      ? defaultHazard()
      : ent.kind === 'trap' && !ent.hazard
        ? {
            enabled: true,
            damage: 40,
            intervalMs: 2000,
            instantKill: false,
            mode: 'timed' as const,
            activeMs: 900,
            obstacleKind: 'spike' as const,
          }
        : {
            enabled: false,
            damage: 25,
            intervalMs: 500,
            instantKill: false,
            mode: 'always' as const,
            activeMs: 1000,
            obstacleKind: 'damage' as const,
          };
  return {
    ...base,
    ...ent.hazard,
  };
}

export function defaultJumpPad(): EntityJumpPad {
  return { enabled: true, boost: 14 };
}

export function ensureJumpPad(ent: EditorEntity): EntityJumpPad {
  return {
    enabled: false,
    boost: 14,
    ...ent.jumpPad,
  };
}

export function defaultSurface(): EntitySurface {
  return { ice: false, conveyor: false, conveyorSpeed: 4 };
}

export function ensureSurface(ent: EditorEntity): EntitySurface {
  return { ...defaultSurface(), ...ent.surface };
}

/** Resolve material for UI + collision export. */
export function resolveCollideMaterial(ent: EditorEntity): EntityCollideMaterial {
  if (ent.collideMaterial) return ent.collideMaterial;
  if (ent.solid === false) return 'walkthrough';
  if (ent.surface?.ice) return 'ice';
  if (ent.surface?.conveyor) return 'solid';
  if (ent.solid === true) return 'solid';
  if (ent.kind === 'finish' || ent.kind === 'checkpoint' || ent.kind === 'jump_pad') return 'solid';
  if (ent.model?.includes('floor') || ent.model?.startsWith('platform')) return 'solid';
  if (ent.model?.includes('stair') || ent.model?.includes('ramp')) return 'solid';
  return 'walkthrough';
}

/** Patch entity fields when the Material dropdown changes. */
export function patchCollideMaterial(
  ent: EditorEntity,
  material: EntityCollideMaterial
): Partial<EditorEntity> {
  const surface = ensureSurface(ent);
  switch (material) {
    case 'walkthrough':
      return {
        collideMaterial: material,
        solid: false,
        surface: { ...surface, ice: false },
      };
    case 'ice':
      return {
        collideMaterial: material,
        solid: true,
        surface: { ...surface, ice: true },
      };
    case 'water':
    case 'sand':
    case 'solid':
      return {
        collideMaterial: material,
        solid: true,
        surface: { ...surface, ice: false },
      };
  }
}

export function defaultTeleport(): EntityTeleport {
  return { enabled: true, cooldownMs: 800 };
}

export function ensureTeleport(ent: EditorEntity): EntityTeleport {
  return {
    enabled: false,
    cooldownMs: 800,
    ...ent.teleport,
  };
}

export function defaultLight(color = '#ffe9a8'): EntityLight {
  return {
    color,
    intensity: 1.4,
    distance: 18,
    castShadow: false,
  };
}

export function ensureLight(ent: EditorEntity): EntityLight {
  return {
    ...defaultLight(ent.color ?? '#ffe9a8'),
    ...ent.light,
  };
}

/** Whether this entity should export as a standable / jump-pad platform. */
export function entityExportsAsPlatform(ent: EditorEntity): boolean {
  if (ent.visible === false) return false;
  if (isInvisibleMarkerKind(ent.kind)) return false;
  if (
    ent.kind === 'light' ||
    ent.kind === 'button' ||
    ent.kind === 'hazard' ||
    ent.kind === 'trap' ||
    ent.kind === 'door' ||
    ent.kind === 'action' ||
    ent.kind === 'red_zone'
  ) {
    return false;
  }
  // Explicit walkthrough never collides.
  if (ent.collideMaterial === 'walkthrough' || ent.solid === false) return false;
  // Finish / revive / health floors / jump pads are standable trigger volumes.
  if (
    ent.kind === 'finish' ||
    ent.kind === 'revive_pad' ||
    ent.kind === 'health_floor' ||
    ent.kind === 'jump_pad'
  ) {
    return true;
  }
  // Jump pads / ice / conveyor / water / sand always export (need a pad).
  if (ent.jumpPad?.enabled) return true;
  if (ent.collideMaterial === 'ice' || ent.collideMaterial === 'water' || ent.collideMaterial === 'sand')
    return true;
  if (ent.surface?.ice || ent.surface?.conveyor) return true;
  if (ent.teleport?.enabled) return true;
  // Explicit authoring wins over name heuristics.
  if (ent.collideMaterial === 'solid' || ent.solid === true) return true;
  if (ent.kind === 'checkpoint') return true;
  if (ent.model?.includes('floor')) return true;
  if (ent.model?.startsWith('platform')) return true;
  // Stairs / walls marked solid by name heuristic when model suggests walkable geometry.
  if (ent.model?.includes('stair') || ent.model?.includes('ramp')) return true;
  return false;
}

/** Human-readable label for an entity kind (editor UI). */
export function entityKindLabel(kind: EditorEntityKind): string {
  switch (kind) {
    case 'prop':
      return 'Prop';
    case 'start':
      return 'Runner Spawn';
    case 'finish':
      return 'Finish';
    case 'trap':
      return 'Trap';
    case 'hazard':
      return 'Death';
    case 'light':
      return 'Light';
    case 'player':
      return 'Player avatar';
    case 'button':
      return 'Button';
    case 'door':
      return 'Door';
    case 'jump_pad':
      return 'Jump pad';
    case 'action':
      return 'Action';
    case 'spawn_runner':
      return 'Runner Spawn';
    case 'spawn_trapper':
      return 'Trapper Spawn';
    case 'checkpoint':
      return 'Checkpoint';
    case 'group':
      return 'Group';
    case 'spawn_monster':
      return 'Enemy Spawn';
    case 'red_zone':
      return 'Death';
    case 'revive_pad':
      return 'Revive pad';
    case 'health_floor':
      return 'Health floor';
    case 'wave_anchor':
      return 'Wave anchor';
    case 'spawn_team_a':
      return 'Player A Spawn';
    case 'spawn_team_b':
      return 'Player B Spawn';
    default:
      return kind;
  }
}

/** Short hint under the Kind dropdown — what this entity actually does. */
export function entityKindHint(kind: EditorEntityKind): string | null {
  switch (kind) {
    case 'player':
      return 'Platform-wide player look (model + animations). Open Player Model — this is not a spawn point and is not placed on the map.';
    case 'start':
    case 'spawn_runner':
      return 'Spawn marker only (where runners appear). Does not change the player model — use Player Model for that.';
    case 'spawn_trapper':
      return 'Invisible Trapper spawn marker for Deathrun. No model upload — spawn point only.';
    case 'spawn_team_a':
      return 'Invisible Team A / Player A spawn marker. Spawn point only — no model upload.';
    case 'spawn_team_b':
      return 'Invisible Team B / Player B spawn marker. Spawn point only — no model upload.';
    case 'spawn_monster':
      return 'Invisible enemy spawn marker for Horde waves. Configure monster type below — no model upload.';
    case 'prop':
      return 'Floors / walls / stairs / decoration. Set Material (Solid / Water / Sand / Ice / Walkthrough) for collision.';
    case 'finish':
      return 'Touch to clear the course. Invisible marker unless you assign a model.';
    case 'checkpoint':
      return 'Invisible soft-respawn marker if you fall into the void.';
    case 'hazard':
    case 'red_zone':
    case 'trap':
      return 'Damages or kills on touch (see Interaction / Death).';
    case 'button':
      return 'Press Use / E nearby to trigger linked doors or traps.';
    case 'door':
      return 'Animated door / gate. Wire a Button or set Animation trigger.';
    case 'jump_pad':
      return 'Launches the player upward. Place on a floor surface.';
    case 'action':
      return 'Invisible trigger volume for scripted actions / signals.';
    case 'light':
      return 'Point light (visible bulb in editor; light in game).';
    default:
      return null;
  }
}

/**
 * Simplified entity palette for the Entities toolbar — mode-specific markers & gameplay.
 * Props / floors still come from the Assets brush, not this list.
 */
export function entityKindsForMode(mode: KilrunMode): EditorEntityKind[] {
  if (mode === 'horde') {
    return [
      'start',
      'spawn_monster',
      'hazard',
      'light',
      'door',
      'red_zone',
      'revive_pad',
      'health_floor',
      'player',
    ];
  }
  if (mode === 'competitive') {
    return ['spawn_team_a', 'spawn_team_b', 'hazard', 'light', 'door', 'player'];
  }
  return [
    'start',
    'spawn_trapper',
    'finish',
    'button',
    'trap',
    'hazard',
    'door',
    'jump_pad',
    'action',
    'light',
    'checkpoint',
    'player',
  ];
}

/** Kinds that place as invisible markers (no GLB) — editor shows a flag/cone only. */
export function isMarkerEntityKind(kind: EditorEntityKind): boolean {
  return (
    isInvisibleMarkerKind(kind) ||
    kind === 'finish' ||
    kind === 'light' ||
    kind === 'jump_pad' ||
    kind === 'button' ||
    kind === 'door' ||
    kind === 'hazard' ||
    kind === 'trap' ||
    kind === 'red_zone' ||
    kind === 'revive_pad' ||
    kind === 'health_floor'
  );
}

export function generateId(prefix = 'ent'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function snapToGrid(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export function createEmptyMap(
  name = 'Untitled Map',
  gameMode: KilrunMode = 'deathrun'
): MapDocument {
  const mode = normalizeKilrunMode(gameMode);
  if (mode === 'horde') return createEmptyHordeMap(name);
  if (mode === 'competitive') return createEmptyCompetitiveMap(name);
  return createEmptyDeathrunMap(name);
}

function baseLayers() {
  const floorId = generateId('layer');
  const propsId = generateId('layer');
  const spawnsId = generateId('layer');
  return {
    floorId,
    propsId,
    spawnsId,
    layers: [
      { id: floorId, name: 'Floor', visible: true, locked: false, order: 0 },
      { id: propsId, name: 'Props', visible: true, locked: false, order: 1 },
      { id: spawnsId, name: 'Spawns', visible: true, locked: false, order: 2 },
    ] as EditorLayer[],
  };
}

function createEmptyDeathrunMap(name: string): MapDocument {
  const { floorId, spawnsId, layers } = baseLayers();
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    gameMode: 'deathrun',
    gridSize: 1,
    environment: { ...DEFAULT_ENVIRONMENT },
    layers,
    entities: [
      {
        id: generateId(),
        name: 'Start Floor',
        kind: 'prop',
        model: 'floor-square',
        layerId: floorId,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
        color: '#3d5a80',
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Course Floor',
        kind: 'prop',
        model: 'floor-square',
        layerId: floorId,
        position: [0, 0, 8],
        rotation: [0, 0, 0],
        scale: [1.5, 1, 1.5],
        color: '#3d5a80',
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'End Floor',
        kind: 'prop',
        model: 'floor-square',
        layerId: floorId,
        position: [0, 0, 16],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
        color: '#3d5a80',
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Runner Spawn 1',
        kind: 'start',
        layerId: spawnsId,
        position: [0, 0, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#22c55e',
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Finish',
        kind: 'finish',
        layerId: spawnsId,
        position: [0, 0, 20],
        rotation: [0, 0, 0],
        scale: [2.2, 1, 2.2],
        color: '#fbbf24',
        solid: true,
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Trapper Spawn',
        kind: 'spawn_trapper',
        layerId: spawnsId,
        position: [4, 0, 10],
        rotation: [0, 180, 0],
        scale: [1, 1, 1],
        color: '#ef4444',
        animation: defaultAnimation(),
      },
    ],
    modeSettings: {
      deathrun: { ...DEFAULT_DEATHRUN_SETTINGS },
    },
    meta: { createdAt: now, updatedAt: now },
  };
}

function createEmptyHordeMap(name: string): MapDocument {
  const { floorId, spawnsId, layers } = baseLayers();
  const now = new Date().toISOString();
  const arena: EditorEntity = {
    id: generateId(),
    name: 'Arena Floor',
    kind: 'prop',
    model: 'floor-square',
    layerId: floorId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [6, 1, 6],
    color: '#3d5a80',
    solid: true,
    animation: defaultAnimation(),
  };
  const playerSpawns: EditorEntity[] = [
    [-2, 0, -2],
    [2, 0, -2],
    [-2, 0, 2],
    [2, 0, 2],
  ].map((pos, i) => ({
    id: generateId(),
    name: `Player Spawn ${i + 1}`,
    kind: 'start' as const,
    layerId: spawnsId,
    position: pos as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    color: '#22c55e',
    animation: defaultAnimation(),
  }));
  return {
    version: 1,
    name,
    gameMode: 'horde',
    gridSize: 1,
    environment: {
      ...DEFAULT_ENVIRONMENT,
      sky: 'void',
      skyColor: '#12080c',
      fogColor: '#1a0a10',
      floorColor: '#2a1520',
    },
    layers,
    entities: [
      arena,
      ...playerSpawns,
      {
        id: generateId(),
        name: 'Enemy Spawn N',
        kind: 'spawn_monster',
        layerId: spawnsId,
        position: [0, 0, 10],
        rotation: [0, 180, 0],
        scale: [1, 1, 1],
        color: '#f43f5e',
        monsterSpawn: defaultMonsterSpawn(),
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Enemy Spawn S',
        kind: 'spawn_monster',
        layerId: spawnsId,
        position: [0, 0, -10],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#f43f5e',
        monsterSpawn: { ...defaultMonsterSpawn(), waveMin: 1, countPerWave: 2 },
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Health Floor',
        kind: 'health_floor',
        model: 'floor-square',
        layerId: floorId,
        position: [6, 0, 0],
        rotation: [0, 0, 0],
        scale: [1.5, 1, 1.5],
        color: '#34d399',
        solid: true,
        healthFloor: defaultHealthFloor(),
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Death Zone',
        kind: 'red_zone',
        layerId: spawnsId,
        position: [-6, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
        color: '#ef4444',
        redZone: defaultRedZone(),
        animation: defaultAnimation(),
      },
    ],
    modeSettings: {
      horde: { ...DEFAULT_HORDE_SETTINGS },
    },
    meta: { createdAt: now, updatedAt: now },
  };
}

function createEmptyCompetitiveMap(name: string): MapDocument {
  const { floorId, spawnsId, layers } = baseLayers();
  const now = new Date().toISOString();
  const mkTeamSpawn = (
    team: 'a' | 'b',
    index: number,
    pos: [number, number, number]
  ): EditorEntity => ({
    id: generateId(),
    name: `Player ${team.toUpperCase()} Spawn ${index}`,
    kind: team === 'a' ? 'spawn_team_a' : 'spawn_team_b',
    layerId: spawnsId,
    position: pos,
    rotation: [0, team === 'a' ? 0 : 180, 0],
    scale: [1, 1, 1],
    color: team === 'a' ? '#38bdf8' : '#f97316',
    animation: defaultAnimation(),
  });
  return {
    version: 1,
    name,
    gameMode: 'competitive',
    gridSize: 1,
    environment: {
      ...DEFAULT_ENVIRONMENT,
      sky: 'dusk',
      skyColor: '#0c1220',
      fogColor: '#101828',
      floorColor: '#1e293b',
    },
    layers,
    entities: [
      {
        id: generateId(),
        name: 'Arena Floor',
        kind: 'prop',
        model: 'floor-square',
        layerId: floorId,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [8, 1, 10],
        color: '#334155',
        solid: true,
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Mid Cover',
        kind: 'prop',
        model: 'wall',
        layerId: floorId,
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [2, 1.2, 0.4],
        color: '#475569',
        solid: true,
        animation: defaultAnimation(),
      },
      mkTeamSpawn('a', 1, [-4, 0, -6]),
      mkTeamSpawn('a', 2, [-2, 0, -6]),
      mkTeamSpawn('a', 3, [2, 0, -6]),
      mkTeamSpawn('a', 4, [4, 0, -6]),
      mkTeamSpawn('b', 1, [-4, 0, 6]),
      mkTeamSpawn('b', 2, [-2, 0, 6]),
      mkTeamSpawn('b', 3, [2, 0, 6]),
      mkTeamSpawn('b', 4, [4, 0, 6]),
    ],
    modeSettings: {
      competitive: { ...DEFAULT_COMPETITIVE_SETTINGS },
    },
    meta: { createdAt: now, updatedAt: now },
  };
}

export function cloneEntity(ent: EditorEntity): EditorEntity {
  return {
    ...ent,
    id: generateId(),
    name: `${ent.name} Copy`,
    position: [ent.position[0] + 1, ent.position[1], ent.position[2] + 1],
    animation: ent.animation
      ? {
          ...ent.animation,
          availableClips: [...ent.animation.availableClips],
          activatesEntityIds: [...(ent.animation.activatesEntityIds ?? [])],
        }
      : undefined,
    playerAnims: ent.playerAnims ? { ...ent.playerAnims } : undefined,
    playerSkins: ent.playerSkins
      ? ent.playerSkins.map((a) => ({
          ...a,
          shape: a.shape ? { ...a.shape } : undefined,
          material: a.material ? { ...a.material } : undefined,
          weapon: a.weapon
            ? {
                ...a.weapon,
                muzzleOffset: a.weapon.muzzleOffset
                  ? ([...a.weapon.muzzleOffset] as [number, number, number])
                  : undefined,
              }
            : undefined,
          sculpt: a.sculpt
            ? { positions: [...a.sculpt.positions], count: a.sculpt.count }
            : undefined,
          bonded: a.bonded
            ? a.bonded.map((b) => ({
                ...b,
                shape: b.shape ? { ...b.shape } : undefined,
                material: b.material ? { ...b.material } : undefined,
                sculpt: b.sculpt
                  ? { positions: [...b.sculpt.positions], count: b.sculpt.count }
                  : undefined,
                position: [...b.position] as [number, number, number],
                rotation: [...b.rotation] as [number, number, number],
                scale: [...b.scale] as [number, number, number],
              }))
            : undefined,
          position: [...a.position] as [number, number, number],
          rotation: [...a.rotation] as [number, number, number],
          scale: [...a.scale] as [number, number, number],
        }))
      : undefined,
    playerMeshEdits: ent.playerMeshEdits
      ? {
          meshColors: ent.playerMeshEdits.meshColors
            ? { ...ent.playerMeshEdits.meshColors }
            : undefined,
          meshScales: ent.playerMeshEdits.meshScales
            ? { ...ent.playerMeshEdits.meshScales }
            : undefined,
          boneScales: ent.playerMeshEdits.boneScales
            ? { ...ent.playerMeshEdits.boneScales }
            : undefined,
        }
      : undefined,
    playerExtraBones: ent.playerExtraBones
      ? ent.playerExtraBones.map((b) => ({
          ...b,
          position: [...b.position] as [number, number, number],
        }))
      : undefined,
    playerAuthoredClips: ent.playerAuthoredClips
      ? ent.playerAuthoredClips.map((c) => ({
          ...c,
          tracks: c.tracks.map((t) => ({
            ...t,
            times: [...t.times],
            values: [...t.values],
          })),
        }))
      : undefined,
    hazard: ent.hazard ? { ...ent.hazard } : undefined,
    jumpPad: ent.jumpPad ? { ...ent.jumpPad } : undefined,
    surface: ent.surface ? { ...ent.surface } : undefined,
    teleport: ent.teleport ? { ...ent.teleport } : undefined,
    light: ent.light ? { ...ent.light } : undefined,
    monsterSpawn: ent.monsterSpawn ? { ...ent.monsterSpawn } : undefined,
    redZone: ent.redZone ? { ...ent.redZone } : undefined,
    revive: ent.revive ? { ...ent.revive } : undefined,
    healthFloor: ent.healthFloor ? { ...ent.healthFloor } : undefined,
    waveAnchor: ent.waveAnchor ? { ...ent.waveAnchor } : undefined,
  };
}

export function ensureEnvironment(doc: MapDocument): MapEnvironment {
  return { ...DEFAULT_ENVIRONMENT, ...doc.environment };
}

export function ensureAnimation(ent: EditorEntity): EntityAnimation {
  return { ...defaultAnimation(), ...ent.animation, availableClips: ent.animation?.availableClips ?? [] };
}
