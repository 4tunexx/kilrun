import { type PowerDefinitionRecord } from '@shared/power-definitions';

const NON_NEGATIVE_EFFECT_FIELDS = [
  'durationBaseSec',
  'durationPerLevelSec',
  'energyCost',
  'cooldownMs',
  'radiusBaseMeters',
  'radiusPerLevelMeters',
  'damageBase',
  'damagePerLevel',
  'rangeBaseMeters',
  'rangePerLevelMeters',
  'pullDurationBaseSec',
  'pullDurationPerLevelSec',
] as const;

function sanitizeEffectParams(
  effectType: PowerDefinitionRecord['effectType'],
  params: PowerDefinitionRecord['effectParams']
): PowerDefinitionRecord['effectParams'] {
  if (effectType === 'stat_bonus') return params;
  const p = { ...(params as unknown as Record<string, unknown>) };
  for (const field of NON_NEGATIVE_EFFECT_FIELDS) {
    if (field in p) {
      const n = Number(p[field]);
      p[field] = Math.max(0, Number.isFinite(n) ? n : 0);
    }
  }
  return p as unknown as PowerDefinitionRecord['effectParams'];
}

export function validatePowerRecord(
  body: unknown
): { ok: true; record: PowerDefinitionRecord } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  const key = String(b.key ?? '').trim();
  if (!key || !/^[a-z0-9_]+$/i.test(key)) {
    return { ok: false, error: 'key must be a non-empty alphanumeric/underscore slug' };
  }
  const name = String(b.name ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };
  const effectType = String(b.effectType ?? '');
  if (!['stat_bonus', 'timed_buff', 'burst_effect'].includes(effectType)) {
    return { ok: false, error: 'effectType must be stat_bonus | timed_buff | burst_effect' };
  }
  const cost = b.cost as PowerDefinitionRecord['cost'];
  if (!cost || (cost.type !== 'flat' && cost.type !== 'ramp')) {
    return { ok: false, error: 'cost must be { type: "flat"|"ramp", ... }' };
  }
  const record: PowerDefinitionRecord = {
    key,
    name,
    description: String(b.description ?? ''),
    icon: String(b.icon ?? '✨'),
    maxLevel: Math.max(1, Math.min(50, Number(b.maxLevel) || 5)),
    unlockLevel: Math.max(0, Number(b.unlockLevel) || 0),
    prerequisites: Array.isArray(b.prerequisites)
      ? (b.prerequisites as { key: string; level: number }[])
          .filter((p) => p && typeof p.key === 'string')
          .map((p) => ({ key: p.key, level: Math.max(1, Number(p.level) || 1) }))
      : [],
    cost,
    effectType: effectType as PowerDefinitionRecord['effectType'],
    effectParams: sanitizeEffectParams(
      effectType as PowerDefinitionRecord['effectType'],
      (b.effectParams ?? {}) as PowerDefinitionRecord['effectParams']
    ),
    isCore: false,
    sortOrder: Number(b.sortOrder) || 0,
    posX: typeof b.posX === 'number' && Number.isFinite(b.posX) ? b.posX : null,
    posY: typeof b.posY === 'number' && Number.isFinite(b.posY) ? b.posY : null,
  };
  return { ok: true, record };
}
