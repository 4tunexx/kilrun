import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { flattenEquippedSkinsMap } from '@/lib/player-skins';
import { resolveWeaponCombat, findWeaponAttachment } from '@/lib/weapons';
import { compactSkinsForMatch } from '@/lib/match-loadout';

export const runtime = 'nodejs';

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Game-server only: trusted loadout for a userId (DB skins, not client JSON).
 * Header: x-admin-secret: GAME_SERVER_ADMIN_SECRET
 * Query: ?userId=
 */
export async function GET(req: NextRequest) {
  const expected = process.env.GAME_SERVER_ADMIN_SECRET || '';
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 });
  }
  const provided = req.headers.get('x-admin-secret') || '';
  if (!provided || !secretsEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('userId')?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { steamId: userId }] },
      select: { id: true, equippedSkins: true },
    });
    if (!user) {
      return NextResponse.json({ ok: true, equippedSkinsJson: '[]', weaponCombat: null });
    }

    const attachments = flattenEquippedSkinsMap(user.equippedSkins as never);
    const packed = compactSkinsForMatch(attachments);
    const equippedSkinsJson = JSON.stringify(packed);
    const weaponCombat = resolveWeaponCombat(findWeaponAttachment(packed));

    return NextResponse.json({
      ok: true,
      userId: user.id,
      equippedSkinsJson,
      weaponCombat,
    });
  } catch (err) {
    console.error('[api/game/player-loadout]', err);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
