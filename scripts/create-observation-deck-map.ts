/**
 * One-off: insert the "Observation Deck" deathrun map as a draft GameMap row
 * (isActive: false) so it shows up in the in-game map editor's cloud sync
 * for review.
 *
 * Usage: npx tsx scripts/create-observation-deck-map.ts
 *
 * Field shapes below were verified directly against:
 *   - src/components/game/editor/map-document.ts (createEmptyDeathrunMap,
 *     baseLayers, generateId, DEFAULT_ENVIRONMENT, DEFAULT_DEATHRUN_SETTINGS,
 *     EditorEntity/EditorLayer interfaces)
 *   - src/components/game/editor/prototype-catalog.ts (MODEL_FOOTPRINTS)
 *   - src/components/game/editor/hammer-shapes.ts +
 *     src/components/game/editor/editor-viewport.ts (spawnEntity's Hammer++
 *     branch) + src/components/game/editor/prefab-storage.ts (entityToPad)
 *     + src/components/game/editor/map-scene-visuals.ts (applyEntityOpacity)
 *     + src/components/game/entities/custom-map-overlay.ts (runtime render)
 *     for the glass divider.
 *   - src/components/game/editor/map-validate.ts (validateDeathrunMap) for
 *     the pass/fail rules, re-implemented manually below (avoiding an import
 *     of map-document.ts here, since it pulls in '@/...' aliased imports and
 *     three.js that aren't resolved when this script runs standalone via tsx,
 *     matching how the existing scripts/seed-*.ts one-offs avoid '@/' imports
 *     too).
 *
 * Confirmed field semantics for the Hammer++ solid ("hammer-solid") used for
 * the glass divider:
 *   - model: 'hammer-solid', primitive: 'box'
 *   - scale is always [1,1,1] for Hammer solids (editor-viewport.ts ~L1951)
 *   - collisionSize is the WORLD-SPACE [w,h,d] size directly (not multiplied
 *     by scale, since scale is fixed at 1) — both for the visual mesh
 *     (makeHammerSolidObject/makeHammerSolidMesh) and for collision export
 *     (prefab-storage.ts entityToPad: `foot = e.collisionSize ?? ...` then
 *     `rawX = foot[0] * scale[0]` etc., and isHammerSolidEntity forces
 *     `wallLike` full-height collision regardless of size).
 *   - The mesh is bottom-aligned: entity.position is the base (feet), the
 *     mesh's own Y offset (size[1]/2) is applied internally.
 *   - opacity: 'solid' collision is independent of visual opacity —
 *     map-scene-visuals.ts applyEntityOpacity() sets mat.transparent + mat.opacity
 *     purely on the material (called for every entity, generic, not special
 *     to Hammer solids), while collideMaterial: 'solid' (read by
 *     resolveCollideMaterial in prefab-storage.ts) is what the physics/
 *     collision export honors. So opacity ~0.3 + collideMaterial: 'solid'
 *     genuinely renders as see-through glass while remaining fully blocking —
 *     confirmed also honored at runtime in
 *     src/components/game/entities/custom-map-overlay.ts (same
 *     applyEntityOpacity call + isHammerSolidEntity branch).
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// ---- minimal local type shapes (mirrors map-document.ts) -----------------

type Vec3 = [number, number, number];

interface EditorLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

interface EditorEntity {
  id: string;
  name: string;
  kind: string;
  model?: string;
  primitive?: string;
  layerId: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color?: string;
  opacity?: number;
  visible?: boolean;
  solid?: boolean;
  collideMaterial?: string;
  collisionSize?: Vec3;
}

interface MapDocument {
  version: 1;
  name: string;
  gameMode: string;
  gridSize: number;
  layers: EditorLayer[];
  entities: EditorEntity[];
  environment?: Record<string, unknown>;
  modeSettings?: Record<string, unknown>;
  meta?: { createdAt?: string; updatedAt?: string };
}

let idCounter = 0;
function generateId(prefix = 'ent'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

// ---- verified defaults (copied verbatim from map-document.ts) ------------

const DEFAULT_ENVIRONMENT = {
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
  gridVisible: true,
  voidColor: '#050810',
  voidFloorColor: '#0a2412',
  voidFloorOpacity: 0.9,
  voidFogColor: '#26c05d',
  voidFogDensity: 0.05,
  voidShadowIntensity: 1.1,
  voidShadowColor: '#65ffa9',
};

const DEFAULT_DEATHRUN_SETTINGS = {
  warmupSec: 10,
  roundTimeSec: 180,
  maxRunners: 8,
  trapperEnabled: true,
  livesPerRunner: 3,
  trapCooldownSec: 5,
  checkpointRespawn: true,
};

// ---- layers (mirrors baseLayers()) ----------------------------------------

const floorId = generateId('layer');
const wallsId = generateId('layer');
const propsId = generateId('layer');
const spawnsId = generateId('layer');

const layers: EditorLayer[] = [
  { id: floorId, name: 'Floor', visible: true, locked: false, order: 0 },
  { id: wallsId, name: 'Walls', visible: true, locked: false, order: 1 },
  { id: propsId, name: 'Props', visible: true, locked: false, order: 2 },
  { id: spawnsId, name: 'Spawns', visible: true, locked: false, order: 3 },
];

// ---- entities --------------------------------------------------------------
// Footprints confirmed from prototype-catalog.ts MODEL_FOOTPRINTS:
//   floor-square: [2, 0.2, 2]   wall: [2, 2, 0.25]
//   column: [0.6, 2, 0.6]       crate / crate-color: [1, 1, 1]
// World size = footprint * scale (local axes), then yaw-rotated. Entity
// `position` is the XZ center of the resulting box; walls/floors/props here
// are bottom-aligned so position[1] = 0 sits their base on the floor plane.

const entities: EditorEntity[] = [];

function floorTile(name: string, cx: number, cz: number, sizeX: number, sizeZ: number) {
  entities.push({
    id: generateId(),
    name,
    kind: 'prop',
    model: 'floor-square',
    layerId: floorId,
    position: [cx, 0, cz],
    rotation: [0, 0, 0],
    scale: [sizeX / 2, 1, sizeZ / 2],
    color: '#3d5a80',
    solid: true,
  });
}

// Runner arena floor: x -10..10 (20 wide), z 0..24 (24 long) — 3 tiles down
// the length so the tiling reads cleanly instead of one giant stretched quad.
floorTile('Arena Floor A', 0, 4, 20, 8);
floorTile('Arena Floor B', 0, 12, 20, 8);
floorTile('Arena Floor C', 0, 20, 20, 8);

// Trapper booth floor: x 10..16 (6 wide), z 0..24 (24 long) — single tile.
floorTile('Booth Floor', 13, 12, 6, 24);

function wallSeg(
  name: string,
  cx: number,
  cz: number,
  worldLength: number,
  yaw: 0 | 90,
  worldThickness = 0.25,
  worldHeight = 3
) {
  // wall footprint local [2 (width), 2 (height), 0.25 (thickness)].
  // yaw 90 swaps local X/Z into world Z/X (yawAlignedSize in map-document.ts).
  const sx = yaw === 90 ? worldThickness / 0.25 : worldLength / 2;
  const sz = yaw === 90 ? worldLength / 2 : worldThickness / 0.25;
  const sy = worldHeight / 2;
  entities.push({
    id: generateId(),
    name,
    kind: 'prop',
    model: 'wall',
    layerId: wallsId,
    position: [cx, 0, cz],
    rotation: [0, yaw, 0],
    scale: [sx, sy, sz],
    color: '#41506b',
    solid: true,
    collideMaterial: 'solid',
  });
}

// Runner arena: west wall (x=-10, full 0..24 length), north wall (z=24,
// full -10..10 width). South end (z=0) intentionally left open — entrance.
wallSeg('Arena West Wall', -10, 12, 24, 90);
wallSeg('Arena North Wall', 0, 24, 20, 0);

// Trapper booth: east wall (x=16), north wall (z=24, x 10..16), south wall
// (z=0, x 10..16). West side is the shared boundary — glass, not a wall.
wallSeg('Booth East Wall', 16, 12, 24, 90);
wallSeg('Booth North Wall', 13, 24, 6, 0);
wallSeg('Booth South Wall', 13, 0, 6, 0);

// Glass divider: one continuous Hammer++ box solid along the shared
// boundary x=10, full z 0..24, ~3 tall, ~0.3 thick, tinted + translucent but
// still `collideMaterial: 'solid'` so it truly blocks runners.
entities.push({
  id: generateId(),
  name: 'Observation Glass',
  kind: 'prop',
  model: 'hammer-solid',
  primitive: 'box',
  layerId: wallsId,
  position: [10, 0, 12],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: '#7dd3fc',
  opacity: 0.3,
  solid: true,
  collideMaterial: 'solid',
  collisionSize: [0.3, 3, 24],
});

// Spawns.
entities.push({
  id: generateId(),
  name: 'Runner Spawn',
  kind: 'start',
  layerId: spawnsId,
  position: [0, 0, 1],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: '#22c55e',
});

entities.push({
  id: generateId(),
  name: 'Finish',
  kind: 'finish',
  layerId: spawnsId,
  position: [0, 0, 23],
  rotation: [0, 0, 0],
  scale: [2.2, 1, 2.2],
  color: '#fbbf24',
  solid: true,
});

entities.push({
  id: generateId(),
  name: 'Trapper Spawn',
  kind: 'spawn_trapper',
  layerId: spawnsId,
  position: [13, 0, 12],
  rotation: [0, 180, 0],
  scale: [1, 1, 1],
  color: '#ef4444',
});

// Cover props: zigzag rhythm down the arena length, alternating left/right
// of center (x = -10..10, center 0), roughly every 3-4 units of z, clear of
// the start pad (z<=1ish) and the finish pad (z>=~22).
type CoverModel = 'crate' | 'crate-color' | 'column';
const cover: Array<{ name: string; x: number; z: number; model: CoverModel; color?: string }> = [
  { name: 'Cover 1', x: -5, z: 3, model: 'crate' },
  { name: 'Cover 2', x: 5, z: 7, model: 'column' },
  { name: 'Cover 3', x: -5, z: 10, model: 'crate-color', color: '#d97706' },
  { name: 'Cover 4', x: 5, z: 13, model: 'crate' },
  { name: 'Cover 5', x: -5, z: 16, model: 'column' },
  { name: 'Cover 6', x: 5, z: 19, model: 'crate-color', color: '#7c3aed' },
  { name: 'Cover 7', x: -5, z: 21, model: 'crate' },
];

for (const c of cover) {
  entities.push({
    id: generateId(),
    name: c.name,
    kind: 'prop',
    model: c.model,
    layerId: propsId,
    position: [c.x, 0, c.z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: c.color ?? (c.model === 'column' ? '#94a3b8' : '#78350f'),
    solid: true,
  });
}

// ---- assemble the document -------------------------------------------------

const now = new Date().toISOString();

const doc: MapDocument = {
  version: 1,
  name: 'Observation Deck',
  gameMode: 'deathrun',
  gridSize: 1,
  environment: { ...DEFAULT_ENVIRONMENT },
  layers,
  entities,
  modeSettings: { deathrun: { ...DEFAULT_DEATHRUN_SETTINGS } },
  meta: { createdAt: now, updatedAt: now },
};

// ---- manual re-implementation of validateDeathrunMap's pass/fail rules ----
// (map-validate.ts / entityExportsAsPlatform, re-derived by hand since this
// script deliberately avoids importing map-document.ts — see header note.)

function entityExportsAsPlatform(e: EditorEntity): boolean {
  if (e.visible === false) return false;
  const invisibleMarkerKinds = ['spawn_runner', 'start', 'spawn_trapper', 'spawn_monster', 'checkpoint', 'wave_anchor'];
  // NOTE: checkpoint is deliberately NOT invisible in the real map-document.ts
  // (it counts as solid); we only need this list to exclude pure spawn
  // markers here, which matches how none of our spawn entities should count
  // toward the solids total anyway.
  if (['start', 'spawn_runner', 'spawn_trapper', 'spawn_monster'].includes(e.kind)) return false;
  if (['light', 'button', 'hazard', 'trap', 'action', 'red_zone', 'spinner', 'push_rail', 'push_block'].includes(e.kind)) {
    return false;
  }
  if (e.collideMaterial === 'walkthrough' || e.solid === false) return false;
  if (e.kind === 'finish') return true;
  if (e.collideMaterial === 'solid' || e.solid === true) return true;
  if (e.model?.includes('floor')) return true;
  return true;
}

function validateDeathrunMap(d: MapDocument): { level: 'error' | 'warn'; message: string }[] {
  const issues: { level: 'error' | 'warn'; message: string }[] = [];
  const starts = d.entities.filter((e) => e.kind === 'start' || e.kind === 'spawn_runner' || e.kind === 'player');
  const finishes = d.entities.filter((e) => e.kind === 'finish');
  const trappers = d.entities.filter((e) => e.kind === 'spawn_trapper');
  const solids = d.entities.filter(entityExportsAsPlatform);

  if (starts.length === 0) issues.push({ level: 'error', message: 'Add a Start entity (player spawn point).' });
  if (finishes.length === 0) issues.push({ level: 'error', message: 'Add a Finish entity.' });
  if (solids.length < 3) issues.push({ level: 'error', message: `Need at least 3 solid/floor pieces (found ${solids.length}).` });
  if (trappers.length === 0) issues.push({ level: 'warn', message: 'No Trapper Spawn.' });
  return issues;
}

async function main() {
  const issues = validateDeathrunMap(doc);
  const errors = issues.filter((i) => i.level === 'error');
  console.log(`Validation: ${issues.length} issue(s) (${errors.length} error, ${issues.length - errors.length} warn)`);
  for (const i of issues) console.log(`  [${i.level}] ${i.message}`);
  if (errors.length > 0) {
    throw new Error('Map failed validateDeathrunMap-equivalent checks; aborting insert.');
  }

  const solidCount = doc.entities.filter(entityExportsAsPlatform).length;
  console.log(`OK: ${doc.entities.length} entities total, ${solidCount} count as solid/platform pieces.`);

  const documentJson = JSON.stringify(doc);
  console.log(`documentJson size: ${documentJson.length} bytes`);

  const created = await prisma.gameMap.create({
    data: {
      name: 'Observation Deck',
      mode: 'deathrun',
      documentJson,
      isActive: false,
    },
  });

  console.log(`Created GameMap row: id=${created.id} name=${created.name} isActive=${created.isActive}`);

  const readBack = await prisma.gameMap.findUnique({ where: { id: created.id } });
  if (!readBack) throw new Error('Row not found on read-back.');
  console.log(`Read-back OK: id=${readBack.id} name=${readBack.name} mode=${readBack.mode} isActive=${readBack.isActive}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
