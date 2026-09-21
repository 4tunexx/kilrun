/**
 * System-level audit writer for events that have NO staff session: expiry cron jobs, failed
 * purchase bookkeeping, one-off scripts.
 *
 * IMPORTANT: this file deliberately has NO 'use server' directive. In Next.js every export of a
 * 'use server' file becomes a callable endpoint, which would let any browser forge system audit rows.
 * Only import this from server code (server actions, route handlers, scripts).
 *
 * The staff-attributed writer stays in audit.ts (writeAuditLog) and is unchanged.
 */

import { prisma } from '@/lib/prisma';

/**
 * AuditLog.actorId is a required ObjectId, so system rows use this fixed all-zero id and
 * actorUsername 'system'.
 */
export const SYSTEM_ACTOR_ID = '000000000000000000000000';

/** Write an audit row without a session. Never throws: auditing must not break the audited operation. */
export async function writeSystemAuditLog(input: {
  action: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: SYSTEM_ACTOR_ID,
        actorUsername: 'system',
        action: input.action.slice(0, 100),
        targetUserId: input.targetUserId ?? null,
        targetUsername: input.targetUsername ?? null,
        detail: (input.detail ?? '').slice(0, 2000),
      },
    });
  } catch (err) {
    console.error('[audit:system]', input.action, err);
  }
}
