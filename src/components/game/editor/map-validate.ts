import type { MapDocument } from './map-document';

export interface MapValidationIssue {
  level: 'error' | 'warn';
  message: string;
}

export function validateMapForPublish(doc: MapDocument): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const ents = doc.entities ?? [];

  const runners = ents.filter((e) => e.kind === 'spawn_runner');
  const trappers = ents.filter((e) => e.kind === 'spawn_trapper');
  const floors = ents.filter((e) => e.model?.includes('floor'));

  if (runners.length === 0) {
    issues.push({ level: 'error', message: 'Add at least one Runner Spawn.' });
  }
  if (floors.length < 3) {
    issues.push({
      level: 'error',
      message: `Need at least 3 floor pieces for collision (found ${floors.length}).`,
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
