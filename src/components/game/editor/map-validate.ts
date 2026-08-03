import type { MapDocument } from './map-document';
import {
  entityExportsAsPlatform,
  ensureHordeSettings,
  getEntityWarnings,
  getMapGameMode,
} from './map-document';

export interface MapValidationIssue {
  level: 'error' | 'warn';
  message: string;
}

export function validateMapForPublish(doc: MapDocument): MapValidationIssue[] {
  const mode = getMapGameMode(doc);
  if (mode === 'horde') return validateHordeMap(doc);
  if (mode === 'competitive') return validateCompetitiveMap(doc);
  return validateDeathrunMap(doc);
}

function validateDeathrunMap(doc: MapDocument): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const ents = doc.entities ?? [];

  const starts = ents.filter(
    (e) => e.kind === 'start' || e.kind === 'spawn_runner' || e.kind === 'player'
  );
  const finishes = ents.filter((e) => e.kind === 'finish');
  const trappers = ents.filter((e) => e.kind === 'spawn_trapper');
  const solids = ents.filter(entityExportsAsPlatform);

  if (starts.length === 0) {
    issues.push({
      level: 'error',
      message: 'Add a Start entity (player spawn point).',
    });
  }
  if (finishes.length === 0) {
    issues.push({
      level: 'error',
      message: 'Add a Finish entity — runners win by touching it.',
    });
  }
  if (solids.length < 3) {
    issues.push({
      level: 'error',
      message: `Need at least 3 solid / floor pieces for collision (found ${solids.length}).`,
    });
  }
  if (trappers.length === 0) {
    issues.push({ level: 'warn', message: 'No Trapper Spawn — optional but recommended.' });
  }

  const buttons = ents.filter((e) => e.kind === 'button');
  for (const b of buttons) {
    const targets = b.animation?.activatesEntityIds ?? [];
    if (targets.length === 0 && !b.animation?.signalChannel) {
      issues.push({
        level: 'warn',
        message: `Button “${b.name}” has no trap/door linked.`,
      });
    }
  }

  const traps = ents.filter((e) => e.kind === 'trap');
  for (const t of traps) {
    if (!t.animation?.listenToEntityId && t.animation?.trigger !== 'interact') {
      issues.push({
        level: 'warn',
        message: `Trap “${t.name}” isn’t wired to a button (use Button → Activates).`,
      });
    }
  }

  pushOrphanWarnings(ents, issues);
  pushCreatorEngineChecks(doc, issues);
  return issues;
}

function validateHordeMap(doc: MapDocument): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const ents = doc.entities ?? [];
  const starts = ents.filter(
    (e) => e.kind === 'start' || e.kind === 'spawn_runner' || e.kind === 'player'
  );
  const monsters = ents.filter((e) => e.kind === 'spawn_monster');
  const solids = ents.filter(entityExportsAsPlatform);
  const health = ents.filter((e) => e.kind === 'health_floor');
  const revives = ents.filter((e) => e.kind === 'revive_pad');

  if (starts.length === 0) {
    issues.push({
      level: 'error',
      message: 'Add at least one player Start spawn (Horde supports up to 4).',
    });
  } else if (starts.length < 4) {
    issues.push({
      level: 'warn',
      message: `Only ${starts.length} player spawn(s) — Horde is designed for 4 players.`,
    });
  }
  if (monsters.length === 0) {
    issues.push({
      level: 'error',
      message: 'Add at least one Monster Spawn for waves.',
    });
  }
  if (solids.length < 1) {
    issues.push({
      level: 'error',
      message: 'Need a solid arena floor for players to stand on.',
    });
  }
  if (health.length === 0) {
    issues.push({ level: 'warn', message: 'No Health Floor — recommended for longer waves.' });
  }
  if (revives.length === 0) {
    issues.push({ level: 'warn', message: 'No Revive Pad — teammates cannot revive without one.' });
  }

  if (monsters.length > 0) {
    const totalWaves = ensureHordeSettings(doc).totalWaves;
    // waveMax: 0 means "infinite" (no upper bound) — see defaultMonsterSpawn().
    // A spawn where waveMax is set but below waveMin is permanently inactive;
    // that gap is otherwise invisible to the author since nothing errors at
    // runtime, HordeRoom just silently falls back to spawning from every
    // point once wave-filtering produces zero eligible spawns.
    const deadSpawns = monsters.filter((e) => {
      const ms = e.monsterSpawn;
      if (!ms) return false;
      return ms.waveMax !== 0 && ms.waveMax < ms.waveMin;
    });
    if (deadSpawns.length > 0) {
      issues.push({
        level: 'warn',
        message: `${deadSpawns.length} monster spawn(s) have Last Wave < First Wave — they'll never activate.`,
      });
    }

    const coveredWaves = new Set<number>();
    for (const e of monsters) {
      const ms = e.monsterSpawn;
      if (!ms) continue;
      const max = ms.waveMax === 0 ? totalWaves : Math.min(ms.waveMax, totalWaves);
      for (let w = Math.max(1, ms.waveMin); w <= max; w++) coveredWaves.add(w);
    }
    const uncovered: number[] = [];
    for (let w = 1; w <= totalWaves; w++) {
      if (!coveredWaves.has(w)) uncovered.push(w);
    }
    if (uncovered.length > 0) {
      issues.push({
        level: 'warn',
        message: `Wave(s) ${uncovered.join(', ')} have no eligible monster spawn — HordeRoom will fall back to spawning from every point on those waves instead of respecting your wave gating.`,
      });
    }
  }

  pushOrphanWarnings(ents, issues);
  pushCreatorEngineChecks(doc, issues);
  return issues;
}

function validateCompetitiveMap(doc: MapDocument): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const ents = doc.entities ?? [];
  const teamA = ents.filter((e) => e.kind === 'spawn_team_a');
  const teamB = ents.filter((e) => e.kind === 'spawn_team_b');
  const solids = ents.filter(entityExportsAsPlatform);

  if (teamA.length === 0) {
    issues.push({ level: 'error', message: 'Add Team A spawns (up to 4).' });
  } else if (teamA.length < 4) {
    issues.push({
      level: 'warn',
      message: `Team A has ${teamA.length} spawn(s) — Competitive is 4v4.`,
    });
  }
  if (teamB.length === 0) {
    issues.push({ level: 'error', message: 'Add Team B spawns (up to 4).' });
  } else if (teamB.length < 4) {
    issues.push({
      level: 'warn',
      message: `Team B has ${teamB.length} spawn(s) — Competitive is 4v4.`,
    });
  }
  if (solids.length < 1) {
    issues.push({
      level: 'error',
      message: 'Need a solid arena floor for the 4v4 match.',
    });
  }

  // Payload push blocks silently fall back to alive-count team-elimination
  // scoring server-side if unwired — warn the author so a map that was meant
  // to be a payload match doesn't ship without anyone noticing it never
  // actually pushes.
  const pushRails = ents.filter((e) => e.kind === 'push_rail');
  const pushBlocks = ents.filter((e) => e.kind === 'push_block');
  if (pushBlocks.length > 0 && pushRails.length === 0) {
    issues.push({
      level: 'error',
      message: 'Push block(s) present with no push_rail — the payload has nothing to ride on.',
    });
  } else if (pushBlocks.length > 0) {
    const railIds = new Set(pushRails.map((r) => r.id));
    const unlinked = pushBlocks.filter(
      (b) => !b.pushBlock?.railEntityId || !railIds.has(b.pushBlock.railEntityId)
    );
    if (unlinked.length > 0) {
      issues.push({
        level: 'warn',
        message: `${unlinked.length} push block(s) aren't linked to a push_rail — they'll auto-attach to the nearest rail at match start, which may not be the one you intended.`,
      });
    }
  }

  pushOrphanWarnings(ents, issues);
  pushCreatorEngineChecks(doc, issues);
  return issues;
}

function pushOrphanWarnings(
  ents: MapDocument['entities'],
  issues: MapValidationIssue[]
) {
  // Flag anything sitting far from the play area on any axis, not just Y —
  // the message says "far from origin", so a prop 500 units away on X/Z
  // (but at ground level) needs the same warning as one floating high up.
  // Also don't limit this to `kind === 'prop'`: hazards, doors, spinners,
  // and other placeable entities can be misplaced the same way.
  const ORPHAN_DISTANCE = 40;
  const orphans = ents.filter((e) => {
    if (e.kind === 'prop' && e.model?.includes('floor')) return false;
    const [x, y, z] = e.position;
    return (
      Math.abs(x) > ORPHAN_DISTANCE ||
      Math.abs(y) > ORPHAN_DISTANCE ||
      Math.abs(z) > ORPHAN_DISTANCE
    );
  });
  if (orphans.length > 0) {
    issues.push({
      level: 'warn',
      message: `${orphans.length} entity(ies) are very far from origin — check positions.`,
    });
  }
}

/** Shared creator-engine checks for every mode before publish. */
function pushCreatorEngineChecks(doc: MapDocument, issues: MapValidationIssue[]) {
  const ents = doc.entities ?? [];
  if (!doc.name?.trim()) {
    issues.push({ level: 'error', message: 'Map needs a name before publish.' });
  }
  if (ents.length === 0) {
    issues.push({ level: 'error', message: 'Map is empty — place at least one piece.' });
  }
  if (ents.length > 2500) {
    issues.push({
      level: 'error',
      message: `Too many entities (${ents.length}). Cap is 2500 for stable play — split into levels or simplify.`,
    });
  } else if (ents.length > 1200) {
    issues.push({
      level: 'warn',
      message: `Large map (${ents.length} entities) — may hitch on weaker devices.`,
    });
  }

  let embeddedBytes = 0;
  for (const e of ents) {
    if (e.customModelUrl?.startsWith('data:')) embeddedBytes += e.customModelUrl.length;
    if (e.textureUrl?.startsWith('data:')) embeddedBytes += e.textureUrl.length;
  }
  const mb = embeddedBytes / (1024 * 1024);
  if (mb > 4) {
    issues.push({
      level: 'error',
      message: `Embedded models/textures are ~${mb.toFixed(1)} MB — too large to publish from browser storage. Use smaller GLBs or external URLs.`,
    });
  } else if (mb > 1.5) {
    issues.push({
      level: 'warn',
      message: `Embedded assets ~${mb.toFixed(1)} MB — close to browser save limits.`,
    });
  }

  const layers = doc.layers ?? [];
  if (layers.length > 0 && layers.every((l) => !l.visible)) {
    issues.push({
      level: 'warn',
      message: 'All build levels are hidden — show at least one before playtesting.',
    });
  }

  // "Invisible wall" trap: an entity authored as solid collision (collideMaterial
  // 'solid' or solid === true) with no model/customModelUrl assigned. The
  // runtime falls back to a plain gray placeholder box for these (see
  // shouldUseGameplayFallback in map-scene-visuals.ts), but that's a cosmetic
  // band-aid — warn the author here so it gets caught before publish instead
  // of discovered as an unexpected box in a live match.
  const invisibleSolids = ents.filter(
    (e) =>
      e.visible !== false &&
      (e.collideMaterial === 'solid' || e.solid === true) &&
      !e.model &&
      !e.customModelUrl
  );
  if (invisibleSolids.length > 0) {
    issues.push({
      level: 'warn',
      message: `${invisibleSolids.length} solid entity(ies) have no model assigned — they'll render as a plain gray placeholder box in-game (e.g. “${invisibleSolids[0].name || invisibleSolids[0].kind}”). Assign a model or texture.`,
    });
  }

  // Dangling cross-entity references: a teleporter target or button/trap
  // wiring that points at an id no longer in the map (e.g. from an older
  // imported save, or a JSON edit). The editor scrubs these on delete, but
  // this catches anything that slipped through another path — a dangling
  // teleport target is silently dropped by mapDocToSimTeleports with no
  // other warning, so it'd otherwise ship as a dead, unusable pad.
  const idSet = new Set(ents.map((e) => e.id));
  const danglingTeleports = ents.filter(
    (e) => e.teleport?.enabled && e.teleport.targetEntityId && !idSet.has(e.teleport.targetEntityId)
  );
  if (danglingTeleports.length > 0) {
    issues.push({
      level: 'warn',
      message: `${danglingTeleports.length} teleporter(s) target a deleted entity and won't work (e.g. “${danglingTeleports[0].name}”). Re-link them.`,
    });
  }
  const danglingWiring = ents.filter(
    (e) =>
      (e.animation?.listenToEntityId && !idSet.has(e.animation.listenToEntityId)) ||
      e.animation?.activatesEntityIds?.some((id) => !idSet.has(id))
  );
  if (danglingWiring.length > 0) {
    issues.push({
      level: 'warn',
      message: `${danglingWiring.length} button/trap wiring reference(s) point at a deleted entity (e.g. “${danglingWiring[0].name}”). Re-link them.`,
    });
  }

  // Same "looks configured, does nothing" checks the Properties panel shows
  // live while editing (getEntityWarnings) — surfaced again here as a
  // safety net for anything placed/imported without ever being reselected.
  const entityWarningCount = ents.reduce(
    (sum, e) => sum + getEntityWarnings(e, ents).length,
    0
  );
  if (entityWarningCount > 0) {
    issues.push({
      level: 'warn',
      message: `${entityWarningCount} entity(ies) have a setup warning (⚠ icon in the Outliner or Properties panel) — disabled damage, an unwired button/trigger, a moving platform with no offset, or a teleporter with no destination.`,
    });
  }
}

export function formatValidationSummary(issues: MapValidationIssue[]): string {
  if (!issues.length) return 'Map looks good to publish.';
  return issues.map((i) => `${i.level === 'error' ? '✗' : '⚠'} ${i.message}`).join('\n');
}
