import type { SkinAttachment } from '@/lib/player-skins';
import type { KilrunMode } from '@/lib/game-modes';
import { normalizeKilrunMode } from '@/lib/game-modes';

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
  // Horde
  | 'spawn_monster'
  | 'red_zone'
  | 'revive_pad'
  | 'health_floor'
  | 'wave_anchor'
  // Competitive
  | 'spawn_team_a'
  | 'spawn_team_b';

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
  animation?: EntityAnimation;
  /** Only for kind === 'player' */
  playerAnims?: PlayerAnimBindings;
  /**
   * Model Editor skin attachments (hat, pants, weapon, …) authored against
   * this player mesh — shown in Play Test / match when set on the avatar.
   */
  playerSkins?: SkinAttachment[];
  /** Death zone / damage on touch */
  hazard?: EntityHazard;
  /**
   * Explicit standable collider for match export.
   * When true, entity becomes a server platform pad (top-plane AABB).
   */
  solid?: boolean;
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
  if (
    ent.kind === 'light' ||
    ent.kind === 'spawn_runner' ||
    ent.kind === 'spawn_trapper' ||
    ent.kind === 'start' ||
    ent.kind === 'button' ||
    ent.kind === 'hazard' ||
    ent.kind === 'trap' ||
    ent.kind === 'spawn_monster' ||
    ent.kind === 'wave_anchor' ||
    ent.kind === 'spawn_team_a' ||
    ent.kind === 'spawn_team_b' ||
    ent.kind === 'red_zone'
  ) {
    return false;
  }
  // Finish / revive / health floors are standable trigger volumes.
  if (ent.kind === 'finish' || ent.kind === 'revive_pad' || ent.kind === 'health_floor') {
    return true;
  }
  // Jump pads / ice / conveyor always export (need a pad).
  if (ent.jumpPad?.enabled) return true;
  if (ent.surface?.ice || ent.surface?.conveyor) return true;
  if (ent.teleport?.enabled) return true;
  // Explicit authoring wins over name heuristics.
  if (ent.solid === false) return false;
  if (ent.solid === true) return true;
  if (ent.kind === 'checkpoint') return true;
  if (ent.model?.includes('floor')) return true;
  if (ent.model?.startsWith('platform')) return true;
  return false;
}

/** Human-readable label for an entity kind (editor UI). */
export function entityKindLabel(kind: EditorEntityKind): string {
  switch (kind) {
    case 'prop':
      return 'Prop';
    case 'start':
      return 'Start (spawn)';
    case 'finish':
      return 'Finish';
    case 'trap':
      return 'Trap';
    case 'hazard':
      return 'Death zone';
    case 'light':
      return 'Light';
    case 'player':
      return 'Player';
    case 'button':
      return 'Button';
    case 'spawn_runner':
      return 'Spawn Runner';
    case 'spawn_trapper':
      return 'Spawn Trapper';
    case 'checkpoint':
      return 'Checkpoint';
    case 'group':
      return 'Group';
    case 'spawn_monster':
      return 'Monster spawn';
    case 'red_zone':
      return 'Red zone';
    case 'revive_pad':
      return 'Revive pad';
    case 'health_floor':
      return 'Health floor';
    case 'wave_anchor':
      return 'Wave anchor';
    case 'spawn_team_a':
      return 'Team A spawn';
    case 'spawn_team_b':
      return 'Team B spawn';
    default:
      return kind;
  }
}

/** Entity kinds available in the Kind dropdown / palette for a mode. */
export function entityKindsForMode(mode: KilrunMode): EditorEntityKind[] {
  const shared: EditorEntityKind[] = ['prop', 'player', 'light', 'checkpoint'];
  if (mode === 'horde') {
    return [
      ...shared,
      'start',
      'spawn_monster',
      'red_zone',
      'revive_pad',
      'health_floor',
      'wave_anchor',
      'hazard',
    ];
  }
  if (mode === 'competitive') {
    return [...shared, 'spawn_team_a', 'spawn_team_b', 'hazard'];
  }
  return [
    ...shared,
    'start',
    'finish',
    'trap',
    'hazard',
    'button',
    'spawn_runner',
    'spawn_trapper',
  ];
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
        name: 'Start',
        kind: 'start',
        model: 'figurine',
        layerId: spawnsId,
        position: [0, 0.5, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#22c55e',
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Finish',
        kind: 'finish',
        model: 'floor-square',
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
        model: 'figurine-large',
        layerId: spawnsId,
        position: [4, 0.5, 10],
        rotation: [0, 180, 0],
        scale: [1, 1, 1],
        color: '#ef4444',
        animation: defaultAnimation(),
      },
    ],
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
    [-2, 0.5, -2],
    [2, 0.5, -2],
    [-2, 0.5, 2],
    [2, 0.5, 2],
  ].map((pos, i) => ({
    id: generateId(),
    name: `Player Spawn ${i + 1}`,
    kind: 'start' as const,
    model: 'figurine',
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
        name: 'Monster Spawn N',
        kind: 'spawn_monster',
        model: 'figurine-large',
        layerId: spawnsId,
        position: [0, 0.5, 10],
        rotation: [0, 180, 0],
        scale: [1, 1, 1],
        color: '#f43f5e',
        monsterSpawn: defaultMonsterSpawn(),
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Monster Spawn S',
        kind: 'spawn_monster',
        model: 'figurine-large',
        layerId: spawnsId,
        position: [0, 0.5, -10],
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
        name: 'Revive Pad',
        kind: 'revive_pad',
        model: 'floor-square',
        layerId: floorId,
        position: [-6, 0, 0],
        rotation: [0, 0, 0],
        scale: [1.5, 1, 1.5],
        color: '#60a5fa',
        solid: true,
        revive: defaultRevive(),
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Red Zone',
        kind: 'red_zone',
        model: 'floor-square',
        layerId: floorId,
        position: [0, 0, 6],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
        color: '#ef4444',
        redZone: defaultRedZone(),
        animation: defaultAnimation(),
      },
      {
        id: generateId(),
        name: 'Wave 1 Anchor',
        kind: 'wave_anchor',
        model: 'target-a-square',
        layerId: spawnsId,
        position: [0, 0.2, 0],
        rotation: [0, 0, 0],
        scale: [0.6, 0.6, 0.6],
        color: '#fbbf24',
        waveAnchor: defaultWaveAnchor(),
        animation: defaultAnimation(),
      },
    ],
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
    name: `Team ${team.toUpperCase()} Spawn ${index}`,
    kind: team === 'a' ? 'spawn_team_a' : 'spawn_team_b',
    model: 'figurine',
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
      mkTeamSpawn('a', 1, [-4, 0.5, -6]),
      mkTeamSpawn('a', 2, [-2, 0.5, -6]),
      mkTeamSpawn('a', 3, [2, 0.5, -6]),
      mkTeamSpawn('a', 4, [4, 0.5, -6]),
      mkTeamSpawn('b', 1, [-4, 0.5, 6]),
      mkTeamSpawn('b', 2, [-2, 0.5, 6]),
      mkTeamSpawn('b', 3, [2, 0.5, 6]),
      mkTeamSpawn('b', 4, [4, 0.5, 6]),
    ],
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
          position: [...a.position] as [number, number, number],
          rotation: [...a.rotation] as [number, number, number],
          scale: [...a.scale] as [number, number, number],
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
