import type { MapDocument } from './map-document';
import { entityExportsAsPlatform } from './map-document';

export interface MapValidationIssue {
  level: 'error' | 'warn';
  message: string;
}

export function validateMapForPublish(doc: MapDocument): MapValidationIssue[] {
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

  return issues;
}

export function formatValidationSummary(issues: MapValidationIssue[]): string {
  if (!issues.length) return 'Map looks good to publish.';
  return issues.map((i) => `${i.level === 'error' ? '✗' : '⚠'} ${i.message}`).join('\n');
}
