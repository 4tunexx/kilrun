import { describe, expect, it } from 'vitest';
import {
  createEmptyMap,
  entityKindsForMode,
  ensureDeathrunSettings,
  ensureHordeSettings,
  ensureCompetitiveSettings,
  getMapGameMode,
  isInvisibleMarkerKind,
} from '@/components/game/editor/map-document';
import { validateMapForPublish } from '@/components/game/editor/map-validate';

describe('map game modes', () => {
  it('tags empty maps with the requested mode', () => {
    expect(getMapGameMode(createEmptyMap('D', 'deathrun'))).toBe('deathrun');
    expect(getMapGameMode(createEmptyMap('H', 'horde'))).toBe('horde');
    expect(getMapGameMode(createEmptyMap('C', 'competitive'))).toBe('competitive');
  });

  it('defaults missing gameMode to deathrun', () => {
    const doc = createEmptyMap('Legacy');
    delete (doc as { gameMode?: string }).gameMode;
    expect(getMapGameMode(doc)).toBe('deathrun');
  });

  it('exposes mode-specific entity palettes', () => {
    expect(entityKindsForMode('deathrun')).toContain('finish');
    expect(entityKindsForMode('deathrun')).toContain('spawn_trapper');
    expect(entityKindsForMode('deathrun')).toContain('door');
    expect(entityKindsForMode('deathrun')).toContain('jump_pad');
    expect(entityKindsForMode('deathrun')).toContain('action');
    expect(entityKindsForMode('horde')).toContain('spawn_monster');
    expect(entityKindsForMode('horde')).toContain('health_floor');
    expect(entityKindsForMode('horde')).toContain('revive_pad');
    expect(entityKindsForMode('horde')).toContain('door');
    expect(entityKindsForMode('horde')).not.toContain('finish');
    expect(entityKindsForMode('competitive')).toContain('spawn_team_a');
    expect(entityKindsForMode('competitive')).toContain('spawn_team_b');
    expect(entityKindsForMode('competitive')).toContain('door');
  });

  it('treats spawns as invisible markers', () => {
    expect(isInvisibleMarkerKind('start')).toBe(true);
    expect(isInvisibleMarkerKind('spawn_trapper')).toBe(true);
    expect(isInvisibleMarkerKind('spawn_monster')).toBe(true);
    expect(isInvisibleMarkerKind('prop')).toBe(false);
  });

  it('provides mode settings defaults', () => {
    const dr = createEmptyMap('D', 'deathrun');
    expect(ensureDeathrunSettings(dr).maxRunners).toBe(8);
    const hz = createEmptyMap('H', 'horde');
    expect(ensureHordeSettings(hz).maxPlayers).toBe(4);
    const cp = createEmptyMap('C', 'competitive');
    expect(ensureCompetitiveSettings(cp).roundCount).toBe(6);
  });

  it('validates starter templates without hard errors', () => {
    for (const mode of ['deathrun', 'horde', 'competitive'] as const) {
      const issues = validateMapForPublish(createEmptyMap(`${mode} test`, mode));
      expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    }
  });
});
