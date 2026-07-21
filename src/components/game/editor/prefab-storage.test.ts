import { describe, expect, it } from 'vitest';
import type { MapDocument } from './map-document';
import {
  mapDocSpawnPoints,
  mapDocToSimButtons,
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToSimTeleports,
  mapDocToWorldBounds,
  prepareDocForPlayTest,
  stairEntityToSimPads,
  stripLegacyBakedStairPads,
} from './prefab-storage';

function baseDoc(entities: MapDocument['entities']): MapDocument {
  return {
    version: 1,
    name: 'Test',
    gridSize: 1,
    layers: [{ id: 'l1', name: 'Floor', visible: true, locked: false, order: 0 }],
    entities,
  };
}

describe('mapDocToSimPlatforms', () => {
  it('exports floors and solid props with height', () => {
    const doc = baseDoc([
      {
        id: 'a',
        name: 'Floor',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
      },
      {
        id: 'b',
        name: 'Wall',
        kind: 'prop',
        model: 'wall',
        solid: true,
        layerId: 'l1',
        position: [0, 1, 4],
        rotation: [0, 0, 0],
        scale: [1, 2, 0.3],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.length).toBe(2);
    const floor = pads.find((p) => p.height !== undefined && p.height <= 0.35);
    const wall = pads.find((p) => (p.height ?? 0) > 0.35);
    expect(floor).toBeTruthy();
    expect(wall).toBeTruthy();
    // Editor z → sim x
    expect(wall!.x).toBe(4);
  });

  it('exports jump pads with boost', () => {
    const doc = baseDoc([
      {
        id: 'j',
        name: 'Pad',
        kind: 'prop',
        model: 'floor-square',
        jumpPad: { enabled: true, boost: 16 },
        layerId: 'l1',
        position: [1, 0, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads[0].kind).toBe('jumpPad');
    expect(pads[0].boost).toBe(16);
  });
});

describe('mapDoc spawn / finish / hazards / bounds', () => {
  it('prefers start entity for runner spawn', () => {
    const doc = baseDoc([
      {
        id: 'legacy',
        name: 'Old',
        kind: 'spawn_runner',
        layerId: 'l1',
        position: [9, 0.5, 9],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        id: 's',
        name: 'Start',
        kind: 'start',
        layerId: 'l1',
        position: [2, 0.5, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const spawns = mapDocSpawnPoints(doc);
    expect(spawns.runner).toEqual({ x: 3, y: 2, z: 0.5 });
  });

  it('prepareDocForPlayTest invents Start from Player when missing', () => {
    const doc = baseDoc([
      {
        id: 'p',
        name: 'Player',
        kind: 'player',
        model: 'figurine-cube-detailed',
        layerId: 'l1',
        position: [4, 1, 6],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const prepared = prepareDocForPlayTest(doc);
    expect(prepared.autoStart).toBe(true);
    expect(prepared.doc.entities.some((e) => e.kind === 'start')).toBe(true);
    const start = prepared.doc.entities.find((e) => e.kind === 'start')!;
    expect(start.position).toEqual([4, 1, 6]);
    const again = prepareDocForPlayTest(prepared.doc);
    expect(again.autoStart).toBe(false);
  });

  it('exports finish volumes and expands world bounds', () => {
    const doc = baseDoc([
      {
        id: 'f',
        name: 'Finish',
        kind: 'finish',
        layerId: 'l1',
        position: [0, 0, 40],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
        solid: true,
      },
      {
        id: 's',
        name: 'Start',
        kind: 'start',
        layerId: 'l1',
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const finishes = mapDocToSimFinishes(doc);
    expect(finishes).toHaveLength(1);
    expect(finishes[0].x).toBe(40);
    const pads = mapDocToSimPlatforms(doc);
    const bounds = mapDocToWorldBounds(doc, pads, finishes);
    expect(bounds.maxX).toBeGreaterThan(40);
  });

  it('exports hazards as always-active damage', () => {
    const doc = baseDoc([
      {
        id: 'h',
        name: 'Lava',
        kind: 'hazard',
        layerId: 'l1',
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        hazard: { enabled: true, damage: 30, intervalMs: 400, instantKill: false },
      },
    ]);
    const hazards = mapDocToSimHazards(doc);
    expect(hazards).toHaveLength(1);
    expect(hazards[0].damage).toBe(30);
    expect(hazards[0].alwaysActive).toBe(true);
  });

  it('exports timed traps and button-armed hazards', () => {
    const doc = baseDoc([
      {
        id: 't',
        name: 'Spikes',
        kind: 'trap',
        layerId: 'l1',
        position: [0, 0, 8],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        hazard: {
          enabled: true,
          damage: 50,
          intervalMs: 2000,
          activeMs: 800,
          mode: 'timed',
          obstacleKind: 'spike',
          instantKill: false,
        },
      },
      {
        id: 'b',
        name: 'Btn',
        kind: 'button',
        layerId: 'l1',
        position: [0, 0, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        animation: {
          availableClips: [],
          trigger: 'interact',
          radius: 2,
          loopActive: false,
          loopDefault: true,
          activatesEntityIds: ['armed'],
        },
      },
      {
        id: 'armed',
        name: 'Armed',
        kind: 'hazard',
        layerId: 'l1',
        position: [0, 0, 10],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        hazard: {
          enabled: true,
          damage: 40,
          intervalMs: 500,
          mode: 'button',
          activeMs: 1500,
          instantKill: false,
        },
      },
    ]);
    const hazards = mapDocToSimHazards(doc);
    const timed = hazards.find((h) => h.id === 't');
    const armed = hazards.find((h) => h.id === 'armed');
    expect(timed?.alwaysActive).toBe(false);
    expect(timed?.buttonControlled).toBe(false);
    expect(timed?.kind).toBe('spike');
    expect(timed?.activeMs).toBe(800);
    expect(armed?.buttonControlled).toBe(true);
    expect(armed?.alwaysActive).toBe(false);

    const buttons = mapDocToSimButtons(doc);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].activatesObstacleIds).toContain('armed');
  });

  it('exports ice / conveyor pads and teleports', () => {
    const doc = baseDoc([
      {
        id: 'ice',
        name: 'Ice',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
        solid: true,
        surface: { ice: true },
      },
      {
        id: 'conv',
        name: 'Belt',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0, 4],
        rotation: [0, 90, 0],
        scale: [2, 1, 2],
        solid: true,
        surface: { conveyor: true, conveyorSpeed: 6 },
      },
      {
        id: 'a',
        name: 'Portal A',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0, 12],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        teleport: { enabled: true, targetEntityId: 'b', cooldownMs: 500 },
      },
      {
        id: 'b',
        name: 'Portal B',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [3, 1, 20],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.find((p) => p.kind === 'ice')).toBeTruthy();
    const belt = pads.find((p) => p.kind === 'conveyor');
    expect(belt?.conveyorSpeed).toBe(6);

    const teles = mapDocToSimTeleports(doc);
    expect(teles).toHaveLength(1);
    expect(teles[0].targetX).toBe(20);

    const stairs = stairEntityToSimPads(
      {
        id: 's',
        name: 'Stairs',
        kind: 'prop',
        model: 'stairs',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        solid: true,
        collideMaterial: 'solid',
      },
      4
    );
    expect(stairs).toHaveLength(4);
    expect(stairs.every((s) => s.kind === 'solid')).toBe(true);

    const fromDoc = mapDocToSimPlatforms(
      baseDoc([
        {
          id: 's2',
          name: 'Stairs2',
          kind: 'prop',
          model: 'stairs',
          layerId: 'l1',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          solid: true,
        },
      ])
    );
    expect(fromDoc.length).toBeGreaterThanOrEqual(4);
  });

  it('strips legacy baked stair pad entities', () => {
    const doc = baseDoc([
      {
        id: 'real',
        name: 'Stairs',
        kind: 'prop',
        model: 'stairs',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        solid: true,
      },
      {
        id: 'pad',
        name: 'Stairs Step 3',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 0.15, 0.4],
        solid: true,
      },
    ]);
    const cleaned = stripLegacyBakedStairPads(doc);
    expect(cleaned.entities).toHaveLength(1);
    expect(cleaned.entities[0].id).toBe('real');
  });
});
