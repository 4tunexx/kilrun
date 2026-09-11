/**
 * Editor → Play Test → live-match smoke: the same pads and stepSim that
 * Play Test uses must finish a trivial Start→Finish course.
 */
import { describe, expect, it } from 'vitest';
import type { MapDocument } from '@/components/game/editor/map-document';
import {
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToWorldBounds,
} from '@/components/game/editor/prefab-storage';
import { createSimScratch, stepPlatformer } from '@/lib/platformer-sim';
import { findCollisionMismatches } from '@/components/game/editor/collision-mismatch';
import { predictCombatHit } from '@/lib/client-prediction';
import { canActivateAbility, defaultAbilityHostState } from '@shared/active-abilities';
import { KILRUN_ENGINE_VERSION } from '@/lib/engine/version';
import pkg from '../../package.json';

function floor(id: string, simX: number): MapDocument['entities'][number] {
  return {
    id,
    kind: 'prop',
    name: id,
    model: 'floor-square',
    // Editor (x,y,z) → sim (z, x, y). Place along Three Z so sim X advances.
    position: [0, 0, simX],
    rotation: [0, 0, 0],
    scale: [4, 1, 4],
    solid: true,
  } as MapDocument['entities'][number];
}

function smokeDoc(): MapDocument {
  return {
    version: 1,
    name: 'Smoke',
    gameMode: 'deathrun',
    entities: [
      {
        id: 'start',
        kind: 'start',
        name: 'Start',
        position: [0, 0, 0.2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      } as MapDocument['entities'][number],
      floor('a', 0),
      {
        id: 'jp',
        kind: 'jump_pad',
        name: 'Jump',
        position: [0, 0, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      } as MapDocument['entities'][number],
      floor('b', 6),
      {
        id: 'hz',
        kind: 'hazard',
        name: 'Saw',
        position: [8, 0.5, 6],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      } as MapDocument['entities'][number],
      floor('c', 12),
      {
        id: 'finish',
        kind: 'finish',
        name: 'Finish',
        position: [0, 0.2, 12],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
      } as MapDocument['entities'][number],
    ],
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    gridSize: 1,
  } as MapDocument;
}

describe('editor → Play Test → match smoke', () => {
  it('exports pads and walks Start to Finish with stepPlatformer', () => {
    const doc = smokeDoc();
    const pads = mapDocToSimPlatforms(doc);
    const finishes = mapDocToSimFinishes(doc);
    expect(pads.length).toBeGreaterThanOrEqual(3);
    expect(finishes.length).toBe(1);
    const bounds = mapDocToWorldBounds(doc, pads, finishes);
    const body = {
      x: 0,
      y: 0,
      z: 1.2,
      vx: 0,
      vy: 0,
      vz: 0,
      isGrounded: false,
      energy: 100,
    };
    const scratch = createSimScratch();
    let finished = false;
    for (let i = 0; i < 180; i++) {
      stepPlatformer(
        body,
        { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false },
        1 / 30,
        pads,
        scratch,
        bounds
      );
      const fin = finishes[0];
      if (fin && Math.abs(body.x - fin.x) < fin.width / 2 && Math.abs(body.y - fin.y) < fin.depth / 2) {
        finished = true;
        break;
      }
    }
    expect(finished).toBe(true);
  });

  it('exports a jump pad and an off-path hazard from the same map', () => {
    const doc = smokeDoc();
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.some((p) => p.kind === 'jumpPad')).toBe(true);
    const hazards = mapDocToSimHazards(doc);
    expect(hazards.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(hazards[0].y)).toBeGreaterThan(2);
  });

  it('predicts a hitscan hit on a dummy in front of the shooter', () => {
    const hit = predictCombatHit({
      shooterX: 0,
      shooterY: 0,
      shooterZ: 0,
      aimAngle: 0,
      aimPitch: 0,
      range: 14,
      targets: [{ id: 'dummy', kind: 'monster', x: 6, y: 0, z: 0 }],
    });
    expect(hit?.id).toBe('dummy');
  });

  it('denies an ability cue when energy is empty', () => {
    const gate = canActivateAbility(
      {
        isAlive: true,
        hasFinished: false,
        energy: 0,
        x: 0,
        y: 0,
        z: 0,
        vz: 0,
        aimAngle: 0,
        isInvisible: false,
        ability: defaultAbilityHostState(),
      },
      'fly',
      1000,
      { fly: 1 }
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('energy');
  });

  it('does not flag simple floors as collision mismatches', () => {
    expect(findCollisionMismatches(smokeDoc())).toEqual([]);
  });

  it('keeps Engine version in lockstep with package.json', () => {
    expect(KILRUN_ENGINE_VERSION).toBe(pkg.version);
  });
});
