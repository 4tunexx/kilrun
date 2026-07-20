import type { SkinAttachment } from '@/lib/player-skins';

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
  | 'light';

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
  gridSize: number;
  layers: EditorLayer[];
  entities: EditorEntity[];
  environment?: MapEnvironment;
  meta?: { createdAt?: string; updatedAt?: string };
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
    ent.kind === 'trap'
  ) {
    return false;
  }
  // Finish pads are standable trigger volumes.
  if (ent.kind === 'finish') return true;
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

export function generateId(prefix = 'ent'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function snapToGrid(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export function createEmptyMap(name = 'Untitled Map'): MapDocument {
  const floorId = generateId('layer');
  const propsId = generateId('layer');
  const spawnsId = generateId('layer');
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    gridSize: 1,
    environment: { ...DEFAULT_ENVIRONMENT },
    layers: [
      { id: floorId, name: 'Floor', visible: true, locked: false, order: 0 },
      { id: propsId, name: 'Props', visible: true, locked: false, order: 1 },
      { id: spawnsId, name: 'Spawns', visible: true, locked: false, order: 2 },
    ],
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
  };
}

export function ensureEnvironment(doc: MapDocument): MapEnvironment {
  return { ...DEFAULT_ENVIRONMENT, ...doc.environment };
}

export function ensureAnimation(ent: EditorEntity): EntityAnimation {
  return { ...defaultAnimation(), ...ent.animation, availableClips: ent.animation?.availableClips ?? [] };
}
