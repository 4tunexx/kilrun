import { describe, expect, it } from 'vitest';
import type { MapDocument } from './map-document';
import {
  mapDocSpawnPoints,
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToWorldBounds,
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
});
