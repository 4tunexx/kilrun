export type EditorEntityKind =
  | 'prop'
  | 'spawn_runner'
  | 'spawn_trapper'
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
 * Player locomotion slots → clip names from the model's animation list.
 * Leave a slot empty to fall back / stay on idle.
 */
export type PlayerAnimSlot =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'crouch'
  | 'strafe_left'
  | 'strafe_right'
  | 'back';

export const PLAYER_ANIM_SLOTS: { id: PlayerAnimSlot; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk / Forward' },
  { id: 'run', label: 'Run / Sprint' },
  { id: 'jump', label: 'Jump' },
  { id: 'fall', label: 'Fall / Air' },
  { id: 'crouch', label: 'Crouch' },
  { id: 'strafe_left', label: 'Strafe Left (A)' },
  { id: 'strafe_right', label: 'Strafe Right (D)' },
  { id: 'back', label: 'Walk Back (S)' },
];

export type PlayerAnimBindings = Partial<Record<PlayerAnimSlot, string>>;

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
  /** Milliseconds between damage ticks */
  intervalMs: number;
  /** If true, touching instantly kills / max damage */
  instantKill: boolean;
}

/** Launch player upward when they land / stand on this pad. */
export interface EntityJumpPad {
  enabled: boolean;
  /** Vertical launch speed (sim vz). Default ~14. */
  boost: number;
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
  /** Death zone / damage on touch */
  hazard?: EntityHazard;
  /**
   * Explicit standable collider for match export.
   * When true, entity becomes a server platform pad (top-plane AABB).
   */
  solid?: boolean;
  /** Bounce / launch pad gameplay */
  jumpPad?: EntityJumpPad;
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
  };
}

export function ensureHazard(ent: EditorEntity): EntityHazard {
  if (ent.kind === 'hazard' && !ent.hazard) return defaultHazard();
  return {
    enabled: false,
    damage: 25,
    intervalMs: 500,
    instantKill: false,
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
  if (ent.kind === 'light' || ent.kind === 'spawn_runner' || ent.kind === 'spawn_trapper') {
    return false;
  }
  // Jump pads always export (need a pad to launch from).
  if (ent.jumpPad?.enabled) return true;
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
        name: 'Runner Spawn',
        kind: 'spawn_runner',
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
        name: 'Trapper Spawn',
        kind: 'spawn_trapper',
        model: 'figurine-large',
        layerId: spawnsId,
        position: [0, 0.5, 20],
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
    hazard: ent.hazard ? { ...ent.hazard } : undefined,
    jumpPad: ent.jumpPad ? { ...ent.jumpPad } : undefined,
    light: ent.light ? { ...ent.light } : undefined,
  };
}

export function ensureEnvironment(doc: MapDocument): MapEnvironment {
  return { ...DEFAULT_ENVIRONMENT, ...doc.environment };
}

export function ensureAnimation(ent: EditorEntity): EntityAnimation {
  return { ...defaultAnimation(), ...ent.animation, availableClips: ent.animation?.availableClips ?? [] };
}
