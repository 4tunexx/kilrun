import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import {
  loadPowerDefinitions,
  recordToRowData,
  invalidatePowerDefinitionsCache,
} from '@/lib/power-definitions';
import { STATIC_FALLBACK_POWERS, type PowerDefinitionRecord } from '@shared/power-definitions';

export const runtime = 'nodejs';

/**
 * CRUD for data-driven Power definitions (see shared/power-definitions.ts).
 *
 * GET is intentionally public/unauthenticated — power balance numbers are
 * game config, not sensitive user data, and the Colyseus game server fetches
 * this same endpoint (server-to-server, no session) to hydrate its copy of
 * the definitions. Mutations require admin.
 */

export async function GET() {
  try {
    const powers = await loadPowerDefinitions();
    return NextResponse.json({ ok: true, powers });
  } catch (err) {
    console.error('[api/game/power-definitions GET]', err);
    return NextResponse.json({ ok: true, powers: STATIC_FALLBACK_POWERS });
  }
}

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return null;
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) return null;
  return user;
}

function validateRecord(body: unknown): { ok: true; record: PowerDefinitionRecord } | { ok: false; error: string } {
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
    effectParams: (b.effectParams ?? {}) as PowerDefinitionRecord['effectParams'],
    isCore: false,
    sortOrder: Number(b.sortOrder) || 0,
    posX: typeof b.posX === 'number' && Number.isFinite(b.posX) ? b.posX : null,
    posY: typeof b.posY === 'number' && Number.isFinite(b.posY) ? b.posY : null,
  };
  return { ok: true, record };
}

/** Uploaded icons arrive as data: URLs — persist to durable storage (Blob
 * or /public/uploads) so the DB row stays a short URL, not megabytes of
 * base64. Emoji glyphs and already-hosted URLs pass through untouched. */
async function resolveIcon(icon: string): Promise<string> {
  if (!icon.startsWith('data:image/')) return icon;
  const { persistSiteImage } = await import('@/lib/site-asset-upload');
  return persistSiteImage(icon, 'misc');
}

/** Create a new custom power. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const validated = validateRecord(body);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const existing = await prisma.powerDefinition.findUnique({ where: { key: validated.record.key } });
  if (existing) {
    return NextResponse.json({ ok: false, error: 'A power with this key already exists' }, { status: 409 });
  }

  try {
    validated.record.icon = await resolveIcon(validated.record.icon);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Icon upload failed' },
      { status: 400 }
    );
  }

  const count = await prisma.powerDefinition.count();
  const created = await prisma.powerDefinition.create({
    data: { ...recordToRowData(validated.record), sortOrder: validated.record.sortOrder || count },
  });
  invalidatePowerDefinitionsCache();
  await loadPowerDefinitions({ force: true });
  return NextResponse.json({ ok: true, power: created });
}

/** Update an existing power (core or custom). Core rows: only tunable
 * fields may change — key/effectType/isCore are locked server-side. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('key' in body)) {
    return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });
  }
  const key = String((body as Record<string, unknown>).key);
  const existing = await prisma.powerDefinition.findUnique({ where: { key } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Power not found' }, { status: 404 });

  const validated = validateRecord({ ...body, key });
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  try {
    validated.record.icon = await resolveIcon(validated.record.icon);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Icon upload failed' },
      { status: 400 }
    );
  }

  const data = recordToRowData(validated.record);
  // isCore / effectType / key are immutable for core powers once seeded —
  // admins can retune numbers but not repurpose a core power's mechanic.
  const updateData = existing.isCore
    ? {
        name: data.name,
        description: data.description,
        icon: data.icon,
        maxLevel: data.maxLevel,
        unlockLevel: data.unlockLevel,
        prerequisitesJson: data.prerequisitesJson,
        costJson: data.costJson,
        effectParamsJson: data.effectParamsJson,
        sortOrder: data.sortOrder,
      }
    : { ...data, isCore: false };

  const updated = await prisma.powerDefinition.update({ where: { key }, data: updateData });
  invalidatePowerDefinitionsCache();
  await loadPowerDefinitions({ force: true });
  return NextResponse.json({ ok: true, power: updated });
}

/** Delete a custom power. isCore rows are never deletable. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const key = req.nextUrl.searchParams.get('key')?.trim();
  if (!key) return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });

  const existing = await prisma.powerDefinition.findUnique({ where: { key } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Power not found' }, { status: 404 });
  if (existing.isCore) {
    return NextResponse.json(
      { ok: false, error: 'Core powers cannot be deleted, only tuned.' },
      { status: 400 }
    );
  }

  // Guard: don't delete a power other powers depend on as a prerequisite.
  const all = await prisma.powerDefinition.findMany();
  const dependents = all.filter((p) => {
    try {
      const prereqs = JSON.parse(p.prerequisitesJson || '[]') as { key: string }[];
      return prereqs.some((pr) => pr.key === key);
    } catch {
      return false;
    }
  });
  if (dependents.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot delete: ${dependents.map((d) => d.name).join(', ')} require this power as a prerequisite.`,
      },
      { status: 409 }
    );
  }

  await prisma.powerDefinition.delete({ where: { key } });
  invalidatePowerDefinitionsCache();
  await loadPowerDefinitions({ force: true });
  return NextResponse.json({ ok: true });
}
