import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import {
  loadWeaponDefinitions,
  recordToRowData,
  invalidateWeaponDefinitionsCache,
} from '@/lib/weapon-definitions';
import { STATIC_FALLBACK_WEAPONS, type CatalogWeaponDef } from '@/lib/weapon-catalog';

export const runtime = 'nodejs';

/**
 * CRUD for the data-driven GLOBAL weapon catalog (see src/lib/weapon-catalog.ts).
 *
 * GET is intentionally public/unauthenticated — weapon balance numbers are
 * game config, not sensitive user data, same rationale as
 * /api/game/power-definitions. Mutations require admin.
 */

export async function GET() {
  try {
    const weapons = await loadWeaponDefinitions();
    return NextResponse.json({ ok: true, weapons });
  } catch (err) {
    console.error('[api/game/weapon-definitions GET]', err);
    return NextResponse.json({ ok: true, weapons: STATIC_FALLBACK_WEAPONS });
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

const VALID_KINDS = ['melee', 'hitscan', 'cosmetic'];
const VALID_MODES = ['horde', 'competitive'];

function validateRecord(body: unknown): { ok: true; record: CatalogWeaponDef } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  const id = String(b.id ?? b.key ?? '').trim();
  if (!id || !/^[a-z0-9_]+$/i.test(id)) {
    return { ok: false, error: 'id must be a non-empty alphanumeric/underscore slug' };
  }
  const label = String(b.label ?? '').trim();
  if (!label) return { ok: false, error: 'label is required' };
  const kind = String(b.kind ?? '');
  if (!VALID_KINDS.includes(kind)) {
    return { ok: false, error: 'kind must be melee | hitscan | cosmetic' };
  }
  const modes: Array<'horde' | 'competitive'> = Array.isArray(b.modes)
    ? (b.modes as unknown[]).filter((m): m is 'horde' | 'competitive' => VALID_MODES.includes(String(m)))
    : ['horde', 'competitive'];
  const record: CatalogWeaponDef = {
    id,
    label,
    modelUrl: String(b.modelUrl ?? ''),
    kind: kind as CatalogWeaponDef['kind'],
    combat: (b.combat ?? {}) as CatalogWeaponDef['combat'],
    modes: modes.length ? modes : (['horde', 'competitive'] as Array<'horde' | 'competitive'>),
    gripHint: String(b.gripHint ?? ''),
    unlockMetric: typeof b.unlockMetric === 'string' && b.unlockMetric ? b.unlockMetric : undefined,
    unlockAmount:
      typeof b.unlockAmount === 'number' && Number.isFinite(b.unlockAmount) ? b.unlockAmount : undefined,
    isCore: false,
    sortOrder: Number(b.sortOrder) || 0,
  };
  return { ok: true, record };
}

/** Create a new custom weapon (the original 8 are seeded core rows; this is
 * for future expansion — most admin edits will be PATCHes to core weapons). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const validated = validateRecord(body);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const existing = await prisma.weaponDefinition.findUnique({ where: { key: validated.record.id } });
  if (existing) {
    return NextResponse.json({ ok: false, error: 'A weapon with this id already exists' }, { status: 409 });
  }

  const count = await prisma.weaponDefinition.count();
  const created = await prisma.weaponDefinition.create({
    data: { ...recordToRowData(validated.record), sortOrder: validated.record.sortOrder || count },
  });
  invalidateWeaponDefinitionsCache();
  await loadWeaponDefinitions({ force: true });
  return NextResponse.json({ ok: true, weapon: created });
}

/** Update an existing weapon (core or custom). Core rows: only tunable
 * fields may change — id/isCore are locked server-side. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('id' in body) && !('key' in body)) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
  }
  const key = String((body as Record<string, unknown>).id ?? (body as Record<string, unknown>).key);
  const existing = await prisma.weaponDefinition.findUnique({ where: { key } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Weapon not found' }, { status: 404 });

  const validated = validateRecord({ ...(body as Record<string, unknown>), id: key });
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const data = recordToRowData(validated.record);
  // isCore / id are immutable for core weapons once seeded — admins can
  // retune numbers but not repurpose or delete a core weapon's identity.
  const updateData = existing.isCore
    ? {
        label: data.label,
        modelUrl: data.modelUrl,
        kind: data.kind,
        combatJson: data.combatJson,
        modesJson: data.modesJson,
        gripHint: data.gripHint,
        unlockMetric: data.unlockMetric,
        unlockAmount: data.unlockAmount,
        sortOrder: data.sortOrder,
      }
    : { ...data, isCore: false };

  const updated = await prisma.weaponDefinition.update({ where: { key }, data: updateData });
  invalidateWeaponDefinitionsCache();
  await loadWeaponDefinitions({ force: true });
  return NextResponse.json({ ok: true, weapon: updated });
}

/** Delete a custom weapon. isCore rows are never deletable. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const key = req.nextUrl.searchParams.get('key')?.trim() || req.nextUrl.searchParams.get('id')?.trim();
  if (!key) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });

  const existing = await prisma.weaponDefinition.findUnique({ where: { key } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Weapon not found' }, { status: 404 });
  if (existing.isCore) {
    return NextResponse.json(
      { ok: false, error: 'Core catalog weapons cannot be deleted, only tuned.' },
      { status: 400 }
    );
  }

  await prisma.weaponDefinition.delete({ where: { key } });
  invalidateWeaponDefinitionsCache();
  await loadWeaponDefinitions({ force: true });
  return NextResponse.json({ ok: true });
}
