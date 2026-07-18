'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';

async function requireStaffActor() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Forbidden');
  }
  return user;
}

export async function writeAuditLog(input: {
  actorId: string;
  actorUsername: string;
  action: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  detail?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorUsername: input.actorUsername,
        action: input.action,
        targetUserId: input.targetUserId ?? null,
        targetUsername: input.targetUsername ?? null,
        detail: (input.detail ?? '').slice(0, 2000),
      },
    });
  } catch (err) {
    console.error('[audit]', err);
  }
}

/** Convenience: log using the current staff session as actor. */
export async function auditStaffAction(input: {
  action: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  detail?: string;
}) {
  const actor = await requireStaffActor();
  await writeAuditLog({
    actorId: actor.id,
    actorUsername: actor.username,
    ...input,
  });
}

export async function adminListAuditLogs(take = 80) {
  await requireStaffActor();
  return prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
}
