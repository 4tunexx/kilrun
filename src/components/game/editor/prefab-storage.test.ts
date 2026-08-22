import { describe, expect, it } from 'vitest';
import type { MapDocument } from './map-document';
import {
  mapDocSpawnPoints,
  mapDocToSimActions,
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
  it('exports a hand-tilted hammer solid as one continuous sloped plane, not stepped shelves', () => {
    const doc = baseDoc([
      {
        id: 'ramp1',
        name: 'Tilted Ramp',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        // 4 wide (X), thin (Y), 8 long (Z) — a plank, tilted on pitch to
        // form a ramp climbing along its length. No name hint ("stair"/
        // "ramp") in the model string — this must be detected purely from
        // rotation, since that's how a level designer actually builds one
        // from a generic box primitive.
        collisionSize: [4, 0.4, 8],
        layerId: 'l1',
        position: [0, 2, 0],
        rotation: [25, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    // A rigid box's top face is always flat, no matter the rotation — a
    // single pad with the correct slope gradient is mathematically exact,
    // not an approximation, so this should be exactly one pad, not many
    // discrete shelves (which always reads as stairs, however thin).
    expect(pads.length).toBe(1);
    const pad = pads[0];
    expect(pad.kind).toBe('solid');
    // Genuinely sloped, not flat: a real gradient in one axis.
    const grad = Math.hypot(pad.slopeGradX ?? 0, pad.slopeGradY ?? 0);
    expect(grad).toBeGreaterThan(0.3);
    // 8-long plank tilted 25° should have height = z + grad*offset match a
    // ~3.4-unit total rise (8*sin(25°)) across its run — sanity-check the
    // magnitude is a real slope, not a rounding artifact or the wrong axis.
    const totalRiseAcrossRun = grad * 8 * Math.cos((25 * Math.PI) / 180);
    expect(totalRiseAcrossRun).toBeGreaterThan(2);
    // Thin/top-only so it doesn't ALSO act as a sloped side-wall.
    expect(pad.height ?? 1).toBeLessThanOrEqual(0.35);
  });

  it('fits the collision surface to whichever face is actually up after a 180° flip', () => {
    // Same tilted plank as above (25° pitch), then flipped 180° around X —
    // exactly what the toolbar's Flip button does. The face that WAS the
    // top (local y=0.4) now rotates to point down; the face that WAS the
    // bottom (local y=0) is the one now facing up — i.e. what the player
    // actually sees and stands on. Fitting the plane to the old "always
    // yMax" face put the collision surface at the wrong height entirely:
    // solid to the eye, walk-through in practice.
    const rotation: [number, number, number] = [25 + 180, 0, 0];
    const doc = baseDoc([
      {
        id: 'ramp1f',
        name: 'Tilted Ramp',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        collisionSize: [4, 0.4, 8],
        layerId: 'l1',
        position: [0, 2, 0],
        rotation,
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.length).toBe(1);
    const pad = pads[0];
    // Reproduce just the X-axis rotation (ry=rz=0 here) to know where each
    // candidate local face actually lands in world space.
    const rx = (rotation[0] * Math.PI) / 180;
    const worldYIfTopIsYMax = 2 + 0.4 * Math.cos(rx);
    const worldYIfTopIsYMin = 2 + 0 * Math.cos(rx);
    const trueTopWorldY = Math.max(worldYIfTopIsYMax, worldYIfTopIsYMin);
    // The fitted surface must sit at the face that's actually up...
    expect(pad.z).toBeCloseTo(trueTopWorldY, 1);
    // ...not the other one (this is what the bug produced: off by roughly
    // the box's own thickness projected onto the tilt).
    const wrongFaceWorldY = Math.min(worldYIfTopIsYMax, worldYIfTopIsYMin);
    expect(Math.abs(pad.z - wrongFaceWorldY)).toBeGreaterThan(0.05);
  });

  it('leaves a slightly-off-axis flat solid alone (tolerance, not over-subdividing walls)', () => {
    const doc = baseDoc([
      {
        id: 'wall1',
        name: 'Almost Flat Wall',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        collisionSize: [2, 2, 0.3],
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [1.5, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.length).toBe(1);
  });

  it('never makes a lone spawn marker solid, even via the no-explicit-platforms fallback', () => {
    // A brand-new map: just a Start marker, no floor/platform placed yet —
    // matches how placeAt() actually creates a Start entity (no model set).
    const doc = baseDoc([
      {
        id: 'start1',
        name: 'Start',
        kind: 'start',
        layerId: 'l1',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    // The fallback DOES still invent a small landing pad under the spawn
    // point (so you don't fall through the void on a totally empty map) —
    // that's fine and intended. What must NOT happen is the marker itself
    // becoming a solid collision box.
    for (const pad of pads) {
      expect(pad.width).toBeLessThanOrEqual(6);
      expect(pad.depth).toBeLessThanOrEqual(6);
    }
    expect(pads.length).toBeLessThanOrEqual(1);
  });

  it('never lets a spawn marker collide even if solid/collideMaterial got set on it some other way', () => {
    // Defense in depth: whatever set these (a stray properties-panel toggle,
    // a future upstream filter change, a different call path) — a marker
    // kind must categorically never produce collision.
    const doc = baseDoc([
      {
        id: 'start1',
        name: 'Start',
        kind: 'start',
        model: 'floor_marker',
        solid: true,
        collideMaterial: 'solid',
        layerId: 'l1',
        position: [3, 1, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      // A real floor so the fallback heuristic doesn't even trigger.
      {
        id: 'floor1',
        name: 'Floor',
        kind: 'prop',
        model: 'floor_basic',
        collideMaterial: 'solid',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [10, 1, 10],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    // Only the real floor should produce a pad — nothing at the marker's position.
    for (const pad of pads) {
      expect(Math.hypot(pad.y - 3, pad.x - 3)).toBeGreaterThan(2);
    }
  });

  it('gives tall/steep ramps the same exact single-plane treatment, no scaling issue possible', () => {
    // Old approach needed MORE steps as ramps got taller/steeper (a fixed
    // step count breaks down eventually). The new approach doesn't scale
    // with size at all — a rigid box's top face is always flat regardless
    // of height or angle, so this should still be exactly 1 pad.
    const tallRamp = baseDoc([
      {
        id: 'ramp-tall',
        name: 'Tall Ramp',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        collisionSize: [4, 0.4, 20],
        layerId: 'l1',
        position: [0, 10, 0],
        rotation: [60, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const tallPads = mapDocToSimPlatforms(tallRamp);
    expect(tallPads.length).toBe(1);
    const pad = tallPads[0];
    // Verify the actual height formula (what the server/client sims use:
    // topZ = pad.z + slopeGradX*(x - pad.x) + slopeGradY*(y - pad.y)) gives
    // sane, continuously-varying values across the ramp's real footprint —
    // sample a few points and confirm they differ smoothly, not in jumps.
    const sampleHeights: number[] = [];
    for (const t of [-0.4, -0.2, 0, 0.2, 0.4]) {
      const sampleX = pad.x + t * (pad.width / 2);
      const h = pad.z + (pad.slopeGradX ?? 0) * (sampleX - pad.x);
      sampleHeights.push(h);
    }
    for (let i = 1; i < sampleHeights.length; i++) {
      expect(sampleHeights[i]).not.toBeCloseTo(sampleHeights[i - 1], 5); // actually varies
    }
    expect(sampleHeights.every((h, i) => i === 0 || h !== sampleHeights[i - 1])).toBe(true);
  });

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

  it('exports hammer solid as full-volume collision (not top-only walk-through)', () => {
    const doc = baseDoc([
      {
        id: 'h1',
        name: 'Hammer Solid',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        collisionSize: [2, 0.25, 2],
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        id: 'h2',
        name: 'Tall Hammer',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        collisionSize: [1, 2, 1],
        layerId: 'l1',
        position: [3, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.length).toBe(2);
    for (const pad of pads) {
      // Side collision requires height > 0.35
      expect(pad.height ?? 0).toBeGreaterThan(0.35);
      expect(pad.kind).toBe('solid');
    }
    const tall = pads.find((p) => (p.height ?? 0) >= 2);
    expect(tall).toBeTruthy();
    // Bottom-aligned: topZ ≈ position.y + sizeY
    expect(tall!.z).toBeCloseTo(2, 5);
  });

  it('keeps thin solid wall thickness exact (no 0.35 inflation)', () => {
    const doc = baseDoc([
      {
        id: 'thin',
        name: 'Thin Wall',
        kind: 'prop',
        model: 'hammer-solid',
        primitive: 'box',
        solid: true,
        collideMaterial: 'solid',
        // Thin along editor Z → sim width
        collisionSize: [2, 3, 0.2],
        layerId: 'l1',
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads).toHaveLength(1);
    // Old Math.max(0.35) made Play Test stop short of the mesh — authored
    // thickness (0.2) is preserved, not inflated to a minimum. It does grow
    // by the small SEAM_SKIN margin (0.03 per side) so abutting hand-placed
    // walls always overlap slightly instead of leaving a slip-through seam.
    const SEAM_SKIN = 0.03;
    expect(pads[0].width).toBeCloseTo(0.2 + SEAM_SKIN * 2, 5);
    expect(pads[0].depth).toBeCloseTo(2 + SEAM_SKIN * 2, 5);
    expect(pads[0].height ?? 0).toBeGreaterThan(0.35);
  });

  it('a short custom-model solid prop stands flush and blocks sideways (no floating, no walk-through)', () => {
    // Regression: a "slab" dragged in from the model/prefab library — real
    // content, not a Kenney catalog name, so `model` never matches the
    // 'floor'/'wall'/'platform' substring heuristics. Material defaults to
    // 'solid'. Its measured mesh is genuinely short (0.22m), which used to
    // force height up to a 1.0m/0.8m floor (topZ way above the visible
    // mesh — "floating") and also made it walk-through in resolveSolids
    // (any pad with height <= LAND_STEP_CLIMB was always skipped there).
    const doc = baseDoc([
      {
        id: 'slab1',
        name: 'Custom Slab',
        kind: 'prop',
        model: 'https://blob.example/models/model-abc123def456.glb',
        collisionSize: [1.5, 0.22, 1.5],
        solid: true,
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads).toHaveLength(1);
    const pad = pads[0];
    // topZ must match the real measured mesh top (ty + sizeY), not an
    // inflated wall/solid-volume floor.
    expect(pad.z).toBeCloseTo(0.22, 5);
    // Must NOT be flagged as a walk-over-only pad — a plain solid prop
    // blocks sideways at any height.
    expect(pad.topOnly).toBeFalsy();
  });

  it('a short BAKED mesh-collision prop (the actual Play Test path for model-library props) stands flush', () => {
    // Regression: map-editor.tsx force-rebakes mesh collision for every
    // non-Hammer Solid prop with a model before every Play Test entry
    // (bakeAllSolidMeshCollision), so a dragged-in "slab" almost always
    // collides via its meshCollisionPads (mesh-voxelize.ts output), NOT the
    // plain entityToPad AABB path covered by the test above. That baked
    // path had its OWN independent height-floor bug: localPadsToSimPads
    // used to floor a solid pad's half-height to a minimum of 0.2 (full
    // 0.4m) specifically so resolveSolids' old height<=0.35 walk-through
    // check wouldn't skip it — inflating a real 0.22m-tall slab's standing
    // surface by ~9cm. Now that resolveSolids keys off an explicit topOnly
    // flag instead of height, that floor is gone.
    const doc = baseDoc([
      {
        id: 'baked1',
        name: 'Baked Slab',
        kind: 'prop',
        model: 'https://blob.example/models/model-def456abc123.glb',
        solid: true,
        collideMaterial: 'solid',
        // A single voxel box spanning the full 0.22m-tall mesh, bottom-
        // aligned per plantLocalFeet (cy = half the true height).
        meshCollisionPads: [{ cx: 0, cy: 0.11, cz: 0, hx: 0.75, hy: 0.11, hz: 0.75 }],
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads).toHaveLength(1);
    // Old floor put this at 0.31 (0.2 half-height, doubled). Real top is
    // 0.22 — allow a couple cm for the (now much smaller) seam skin only.
    expect(pads[0].z).toBeLessThan(0.24);
    expect(pads[0].z).toBeGreaterThan(0.2);
    expect(pads[0].topOnly).toBeFalsy();
  });

  it('keeps floor/stair/ramp pads explicitly topOnly so they stay walkable', () => {
    const doc = baseDoc([
      {
        id: 'floor1',
        name: 'Floor',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 1, 2],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    const floor = pads.find((p) => p.height !== undefined && p.height <= 0.35);
    expect(floor?.topOnly).toBe(true);

    const stairPads = stairEntityToSimPads({
      id: 'stairs1',
      name: 'Stairs',
      kind: 'prop',
      model: 'stairs',
      collisionSize: [2, 3, 4],
      layerId: 'l1',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    } as MapDocument['entities'][number]);
    expect(stairPads.length).toBeGreaterThan(0);
    for (const p of stairPads) expect(p.topOnly).toBe(true);
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

  it('exports authored button and action press cooldowns', () => {
    const doc = baseDoc([
      {
        id: 'btn',
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
          activatesEntityIds: ['trap'],
          cooldownMs: 1800,
        },
      },
      {
        id: 'act',
        name: 'Action',
        kind: 'action',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        animation: {
          availableClips: [],
          trigger: 'proximity',
          radius: 2,
          loopActive: false,
          loopDefault: true,
          activatesEntityIds: ['trap'],
          cooldownMs: 900,
        },
      },
      {
        id: 'trap',
        name: 'Trap',
        kind: 'trap',
        layerId: 'l1',
        position: [0, 0, 8],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        hazard: {
          enabled: true,
          damage: 40,
          intervalMs: 500,
          mode: 'button',
          activeMs: 1000,
          instantKill: false,
        },
      },
    ]);
    expect(mapDocToSimButtons(doc)[0].cooldownMs).toBe(1800);
    expect(mapDocToSimActions(doc)[0].cooldownMs).toBe(900);
  });

  it('tags a Solid door wired to a Button as doorControlled; an unwired door is not', () => {
    const doc = baseDoc([
      {
        id: 'btn',
        name: 'Btn',
        kind: 'button',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        animation: {
          availableClips: [],
          trigger: 'interact',
          radius: 2,
          loopActive: false,
          loopDefault: true,
          activatesEntityIds: ['door1'],
        },
      },
      {
        id: 'door1',
        name: 'Door',
        kind: 'door',
        model: 'door-sliding',
        layerId: 'l1',
        position: [0, 0, 4],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        solid: true,
        collideMaterial: 'solid',
      },
      {
        id: 'door2',
        name: 'Unwired door',
        kind: 'door',
        model: 'door-sliding',
        layerId: 'l1',
        position: [0, 0, 8],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        solid: true,
        collideMaterial: 'solid',
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    const wired = pads.find((p) => p.entityId === 'door1');
    const unwired = pads.find((p) => p.entityId === 'door2');
    expect(wired?.doorControlled).toBe(true);
    expect(unwired?.doorControlled).toBeFalsy();

    const buttons = mapDocToSimButtons(doc);
    expect(buttons[0].activatesObstacleIds).toContain('door1');
  });

  it('tags a door as doorControlled when it listens to an Action (not just a Button)', () => {
    const doc = baseDoc([
      {
        id: 'act',
        name: 'Action',
        kind: 'action',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        animation: {
          availableClips: [],
          trigger: 'proximity',
          radius: 2,
          loopActive: false,
          loopDefault: true,
        },
      },
      {
        id: 'door1',
        name: 'Door',
        kind: 'door',
        model: 'door-sliding',
        layerId: 'l1',
        position: [0, 0, 4],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        solid: true,
        collideMaterial: 'solid',
        animation: {
          availableClips: [],
          trigger: 'signal',
          radius: 2,
          loopActive: false,
          loopDefault: true,
          listenToEntityId: 'act',
        },
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    const wired = pads.find((p) => p.entityId === 'door1');
    expect(wired?.doorControlled).toBe(true);

    const actions = mapDocToSimActions(doc);
    expect(actions[0].activatesObstacleIds).toContain('door1');
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

  it('exports checkpoint markers as top-only checkpoint pads', () => {
    const doc = baseDoc([
      {
        id: 'cp1',
        name: 'Checkpoint',
        kind: 'checkpoint',
        layerId: 'l1',
        position: [2, 1, 4],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads).toHaveLength(1);
    expect(pads[0].kind).toBe('checkpoint');
    expect(pads[0].topOnly).toBe(true);
    expect(pads[0].entityId).toBe('cp1');
  });

  it('exports a Y-axis spinner with a sweep AABB covering the spin plane', () => {
    const doc = baseDoc([
      {
        id: 'spin1',
        name: 'Blade',
        kind: 'spinner',
        layerId: 'l1',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        spinHazard: {
          enabled: true,
          speed: 1.5,
          axis: 'y',
          shape: 'bar',
          size: [4, 0.2, 0.3],
          damageOnTouch: true,
          damage: 25,
          intervalMs: 400,
        },
      },
    ]);
    const hazards = mapDocToSimHazards(doc);
    expect(hazards).toHaveLength(1);
    expect(hazards[0].spinSpeed).toBe(1.5);
    expect(hazards[0].spinAxis).toBe('y');
    expect(hazards[0].alwaysActive).toBe(true);
    // size W=4, D=0.3 → sim width uses W * scaleZ, depth uses D * scaleX; sweep maxes both.
    expect(hazards[0].width).toBeCloseTo(4, 5);
    expect(hazards[0].depth).toBeCloseTo(4, 5);
  });

  it('sizes teleports and hazards from collisionSize, not scale*2', () => {
    const doc = baseDoc([
      {
        id: 'pad',
        name: 'Big portal',
        kind: 'prop',
        model: 'floor-square',
        layerId: 'l1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        collisionSize: [8, 0.4, 6],
        teleport: { enabled: true, targetEntityId: 'exit', cooldownMs: 500 },
      },
      {
        id: 'exit',
        name: 'Exit',
        kind: 'prop',
        layerId: 'l1',
        position: [0, 1, 10],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        id: 'lava',
        name: 'Wide lava',
        kind: 'hazard',
        layerId: 'l1',
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        collisionSize: [10, 0.5, 4],
        hazard: { enabled: true, damage: 20, intervalMs: 400, instantKill: false },
      },
    ]);
    const teles = mapDocToSimTeleports(doc);
    expect(teles).toHaveLength(1);
    // sim width = Three Z, sim depth = Three X
    expect(teles[0].width).toBeCloseTo(6, 5);
    expect(teles[0].depth).toBeCloseTo(8, 5);
    expect(teles[0].height).toBeGreaterThanOrEqual(1.4);

    const hazards = mapDocToSimHazards(doc);
    const lava = hazards.find((h) => h.id === 'lava');
    expect(lava?.width).toBeCloseTo(4, 5);
    expect(lava?.depth).toBeCloseTo(10, 5);
    expect(lava?.height).toBeCloseTo(0.5, 5);
  });
});
