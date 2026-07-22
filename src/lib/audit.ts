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

/**
 * Write an audit row. Actor is always the authenticated staff session —
 * client-supplied actorId / actorUsername are ignored.
 */
export async function writeAuditLog(input: {
  /** @deprecated Ignored — actor comes from the staff session. */
  actorId?: string;
  /** @deprecated Ignored — actor comes from the staff session. */
  actorUsername?: string;
  action: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  detail?: string;
}) {
  const staff = await requireStaffActor();
  try {
    await prisma.auditLog.create({
      data: {
        actorId: staff.id,
        actorUsername: staff.username,
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
  await writeAuditLog(input);
}

export async function adminListAuditLogs(take = 200) {
  await requireStaffActor();
  return prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
}
