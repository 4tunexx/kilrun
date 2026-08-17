import { describe, expect, it } from 'vitest';
import {
  defaultSizeForHammer,
  hammerArchCollisionPads,
  hollowHammerCollisionPads,
  isHammerPrimitive,
  makeHammerGeometry,
  HAMMER_PRIMITIVES,
} from './hammer-shapes';
import type { MapDocument } from './map-document';
import { HAMMER_SOLID_MODEL } from './map-document';
import { mapDocMonsterSpawns, mapDocPushPayloads, mapDocToSimHazards, mapDocToSimPlatforms } from './prefab-storage';

function baseDoc(entities: MapDocument['entities']): MapDocument {
  return {
    version: 1,
    name: 'Test',
    gridSize: 1,
    layers: [{ id: 'l1', name: 'Floor', visible: true, locked: false, order: 0 }],
    entities,
  };
}

describe('hammer shapes', () => {
  it('lists shape presets with default sizes', () => {
    expect(HAMMER_PRIMITIVES.length).toBeGreaterThanOrEqual(8);
    expect(isHammerPrimitive('cylinder')).toBe(true);
    expect(isHammerPrimitive('nope')).toBe(false);
    expect(defaultSizeForHammer('spike')[1]).toBeGreaterThan(1);
  });

  it('builds geometry for each shape', () => {
    for (const p of HAMMER_PRIMITIVES) {
      const geo = makeHammerGeometry(p.id, defaultSizeForHammer(p.id));
      expect(geo).toBeTruthy();
      geo.dispose();
    }
  });

  it('arch collision is three boxes with a walkable gap, not one solid AABB', () => {
    const size = defaultSizeForHammer('arch');
    const pads = hammerArchCollisionPads(size);
    expect(pads).toHaveLength(3);
    const leftRight = pads[0].cx + pads[0].hx;
    const rightLeft = pads[1].cx - pads[1].hx;
    expect(rightLeft - leftRight).toBeGreaterThan(0.3);
    expect(hollowHammerCollisionPads('box', [2, 1, 2])).toBeUndefined();
  });

  it('exports an arch as multiple sim platforms so the opening is walkable', () => {
    const size = defaultSizeForHammer('arch');
    const pads = hollowHammerCollisionPads('arch', size)!;
    const sim = mapDocToSimPlatforms(
      baseDoc([
        {
          id: 'a1',
          name: 'Arch',
          kind: 'prop',
          layerId: 'l1',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          model: HAMMER_SOLID_MODEL,
          primitive: 'arch',
          solid: true,
          collideMaterial: 'solid',
          collisionSize: size,
          meshCollisionPads: pads,
        },
      ])
    );
    expect(sim.length).toBe(3);
  });
});

describe('enemy + spinner + push exports', () => {
  it('exports monster spawn with level and model overrides', () => {
    const pads = mapDocMonsterSpawns(
      baseDoc([
        {
          id: 'm1',
          name: 'Boss hole',
          kind: 'spawn_monster',
          layerId: 'l1',
          position: [1, 0, 2],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          monsterSpawn: {
            monsterType: 'custom',
            displayName: 'Skull',
            level: 5,
            hp: 300,
            damage: 40,
            speed: 2.2,
            radius: 0.9,
            modelUrl: '/uploads/skull.glb',
            waveMin: 3,
            waveMax: 0,
            countPerWave: 1,
            spawnIntervalSec: 2,
          },
        },
      ])
    );
    expect(pads[0].level).toBe(5);
    expect(pads[0].hp).toBe(300);
    expect(pads[0].modelUrl).toBe('/uploads/skull.glb');
  });

  it('exports spinner as always-active saw hazard', () => {
    const hazards = mapDocToSimHazards(
      baseDoc([
        {
          id: 's1',
          name: 'Saw',
          kind: 'spinner',
          layerId: 'l1',
          position: [0, 1, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          spinHazard: {
            enabled: true,
            speed: 1.2,
            axis: 'y',
            shape: 'blade',
            size: [2, 0.2, 0.4],
            damageOnTouch: true,
            damage: 25,
            intervalMs: 300,
          },
        },
      ])
    );
    expect(hazards).toHaveLength(1);
    expect(hazards[0].kind).toBe('saw');
    expect(hazards[0].alwaysActive).toBe(true);
    expect(hazards[0].spinSpeed).toBe(1.2);
  });

  it('pairs push block with rail', () => {
    const payloads = mapDocPushPayloads(
      baseDoc([
        {
          id: 'rail1',
          name: 'Rail',
          kind: 'push_rail',
          layerId: 'l1',
          position: [0, 0, 0],
          rotation: [0, 90, 0],
          scale: [1, 1, 1],
          pushRail: { length: 20, width: 3, startT: 0.5 },
        },
        {
          id: 'block1',
          name: 'Cart',
          kind: 'push_block',
          layerId: 'l1',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          pushBlock: {
            railEntityId: 'rail1',
            pushStrength: 4,
            pushRadius: 2,
            winEpsilon: 0.1,
          },
        },
      ])
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0].railId).toBe('rail1');
    expect(payloads[0].length).toBe(20);
    expect(payloads[0].pushStrength).toBe(4);
  });
});
