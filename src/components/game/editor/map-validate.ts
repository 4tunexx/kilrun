import type { MapDocument } from './map-document';
import { entityExportsAsPlatform, getMapGameMode } from './map-document';

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

  pushOrphanWarnings(ents, issues);
  pushCreatorEngineChecks(doc, issues);
  return issues;
}

function pushOrphanWarnings(
  ents: MapDocument['entities'],
  issues: MapValidationIssue[]
) {
  const orphans = ents.filter(
    (e) =>
      e.kind === 'prop' &&
      !e.model?.includes('floor') &&
      Math.abs(e.position[1]) > 40
  );
  if (orphans.length > 0) {
    issues.push({
      level: 'warn',
      message: `${orphans.length} prop(s) are very far from origin — check heights.`,
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
}

export function formatValidationSummary(issues: MapValidationIssue[]): string {
  if (!issues.length) return 'Map looks good to publish.';
  return issues.map((i) => `${i.level === 'error' ? '✗' : '⚠'} ${i.message}`).join('\n');
}
