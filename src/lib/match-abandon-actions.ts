'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/** Current signed-in player's Competitive abandon-match cooldown, if any. */
export async function getMyAbandonCooldown(): Promise<{
  active: boolean;
  cooldownUntil: string | null;
}> {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return { active: false, cooldownUntil: null };
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) return { active: false, cooldownUntil: null };

  const record = await prisma.matchAbandonPenalty.findUnique({ where: { userId: user.id } });
  const active = !!record?.cooldownUntil && record.cooldownUntil.getTime() > Date.now();
  return { active, cooldownUntil: active ? record!.cooldownUntil!.toISOString() : null };
}
