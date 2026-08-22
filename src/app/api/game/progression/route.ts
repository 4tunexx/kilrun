import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import {
  loadGameProgressionForUser,
  loadPowerDefinitionsForMenu,
  upgradeGameAbilityForUser,
} from '@/lib/game-progression-core';
import type { AbilityKey } from '@shared/ability-progression';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

async function requireProgressionUser(req: NextRequest): Promise<{ id: string }> {
  const header = req.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    const staff = await requireEngineStaff(req);
    return { id: staff.id };
  }
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { id: true, isBanned: true },
  });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Banned');
  return { id: user.id };
}

function authStatus(message: string) {
  if (/not authenticated|session expired/i.test(message)) return 401;
  if (/staff only|forbidden/i.test(message)) return 403;
  if (/not enough|unlocks at|already at max|unknown ability|requires /i.test(message)) return 400;
  if (/not found/i.test(message)) return 404;
  return 400;
}

export async function GET(req: NextRequest) {
  try {
    const requested = req.nextUrl.searchParams.get('userId')?.trim() || '';
    let ownerId: string | null = null;
    try {
      ownerId = (await requireProgressionUser(req)).id;
    } catch {
      ownerId = null;
    }
    const userId = requested || ownerId;
    if (!userId) {
      return engineJson(req, { ok: false, error: 'Not authenticated' }, 401);
    }
    const reconcile = ownerId === userId;
    const [progression, powers] = await Promise.all([
      loadGameProgressionForUser(userId, { reconcile }),
      loadPowerDefinitionsForMenu(),
    ]);
    return engineJson(req, { ok: true, progression, powers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    return engineJson(req, { ok: false, error: message }, authStatus(message));
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await requireProgressionUser(req);
    const body = (await req.json().catch(() => null)) as { ability?: string } | null;
    const ability = typeof body?.ability === 'string' ? body.ability.trim() : '';
    if (!ability) {
      return engineJson(req, { ok: false, error: 'ability required' }, 400);
    }
    const progression = await upgradeGameAbilityForUser(owner.id, ability as AbilityKey);
    return engineJson(req, { ok: true, progression });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upgrade failed';
    return engineJson(req, { ok: false, error: message }, authStatus(message));
  }
}
