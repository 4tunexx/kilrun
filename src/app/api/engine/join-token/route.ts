import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import { prisma } from '@/lib/prisma';
import { mintGameJoinToken } from '@/lib/game-join-token';
import { canAccessAdmin } from '@/lib/roles';
import { isPremiumActive, canAccessRankedCompetitive } from '@/lib/premium';
import { parsePremiumConfig } from '@/lib/premium-config';
import { getSiteSettings } from '@/lib/progression-actions';
import { KP_DEFAULT } from '@/lib/kp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

/** Mint a Colyseus join token for the linked desktop Engine staff session. */
export async function POST(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    if (!user || user.isBanned) {
      return engineJson(req, { ok: false, error: 'Staff only' }, 403);
    }

    const settings = await getSiteSettings();
    const premiumCfg = parsePremiumConfig(
      (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
    );
    const isPremium = isPremiumActive({
      isVip: user.isVip,
      premiumExpiresAt: (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt,
    });
    const rankedAccess = canAccessRankedCompetitive({
      isPremium,
      config: premiumCfg,
    });
    const kp = typeof (user as { kp?: number }).kp === 'number' ? (user as { kp: number }).kp : KP_DEFAULT;

    let token: string | null = null;
    try {
      token = mintGameJoinToken({
        userId: user.id,
        steamId: user.steamId || '',
        username: user.username || 'Player',
        avatarUrl: user.avatarUrl || '',
        isAdmin: user.role === 'admin',
        isStaff: canAccessAdmin(user.role),
        isPremium,
        rankedAccess,
        kp,
      });
    } catch {
      token = null;
    }

    return engineJson(req, {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username || 'Player',
        avatarUrl: user.avatarUrl || '',
        role: user.role,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not authenticated';
    const status = message === 'Staff only' ? 403 : 401;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
