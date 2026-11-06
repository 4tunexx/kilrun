import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkCronAuth } from '@/lib/cron-auth';
import { writeSystemAuditLog } from '@/lib/system-audit';
import {
  VIP_COSMETIC_SKUS,
  computeVipExpiryPlan,
  vipNotificationKey,
  vipSnapshotFieldsToClear,
  WARN_3D_MS,
} from '@/lib/vip-expiry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A backlog of expiries can take a while; give the job room on serverless.
export const maxDuration = 60;

const CHUNK = 100;
/** Hard cap per run so one bad run can never touch an unbounded number of rows. */
const MAX_PER_RUN = 2000;

/**
 * Deliberately reads process.env only (not the admin secrets vault): Vercel Cron sends the value of
 * the CRON_SECRET *environment variable*, and a DB-stored credential must not be able to authorise
 * a job that demotes users.
 */
function authorize(req: NextRequest): NextResponse | null {
  const result = checkCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET);
  if (result.ok) return null;
  return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Create a notification once per dedupeKey. Returns true if a new row was created. */
async function notifyOnce(
  userId: string,
  dedupeKey: string,
  title: string,
  body: string
): Promise<boolean> {
  const exists = await prisma.notification.findFirst({
    where: { userId, dedupeKey },
    select: { id: true },
  });
  if (exists) return false;
  try {
    await prisma.notification.create({ data: { userId, title, body, type: 'vip', dedupeKey } });
    return true;
  } catch {
    // A concurrent run created it first, or the write failed: never break the job over a notification.
    return false;
  }
}

export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;

  const started = Date.now();
  const now = Date.now();

  // Only timed VIPs that could need action: already expired, or expiring within the 3-day warn window.
  const candidates = await prisma.user.findMany({
    where: {
      isVip: true,
      vipExpiresAt: { not: null, lte: new Date(now + WARN_3D_MS) },
    },
    select: {
      id: true,
      role: true,
      isVip: true,
      vipExpiresAt: true,
      equippedFrameItemName: true,
      equippedBannerItemName: true,
      equippedNicknameItemName: true,
    },
    orderBy: { vipExpiresAt: 'asc' },
    take: MAX_PER_RUN,
  });

  const plan = computeVipExpiryPlan(candidates, now);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  let expired = 0;
  let unequipped = 0;
  let warned3 = 0;
  let warned1 = 0;
  const failures: string[] = [];

  for (const batch of chunk(plan.expire, CHUNK)) {
    for (const e of batch) {
      try {
        const row = byId.get(e.id)!;

        // Guard on the SAME expiry we planned against: if the user renewed after we loaded them,
        // vipExpiresAt has moved and this update matches nothing, so we never expire a renewed VIP.
        const res = await prisma.user.updateMany({
          where: { id: e.id, isVip: true, vipExpiresAt: e.expiredAt },
          data: { isVip: false, ...(e.demoteRole ? { role: 'player' } : {}) },
        });
        if (res.count === 0) continue;
        expired += 1;

        // Unequip VIP cosmetics but KEEP them in inventory so renewal can re-equip them.
        const un = await prisma.inventoryItem.updateMany({
          where: {
            userId: e.id,
            itemSku: { in: [...VIP_COSMETIC_SKUS] },
            isEquipped: true,
          },
          data: { isEquipped: false },
        });
        unequipped += un.count;

        // Clear the denormalised snapshot ONLY where it still names a VIP item.
        const clear = vipSnapshotFieldsToClear(row);
        const snapshot: Record<string, null> = {};
        if (clear.frame) {
          snapshot.equippedFrameItemName = null;
          snapshot.equippedFrameConfig = null;
        }
        if (clear.banner) {
          snapshot.equippedBannerItemName = null;
          snapshot.equippedBannerConfig = null;
        }
        if (clear.nickname) {
          snapshot.equippedNicknameItemName = null;
          snapshot.equippedNicknameConfig = null;
        }
        if (Object.keys(snapshot).length > 0) {
          await prisma.user.update({ where: { id: e.id }, data: snapshot });
        }

        await notifyOnce(
          e.id,
          vipNotificationKey('expired', e.id, e.expiredAt),
          'VIP expired',
          'Your Kilrun VIP has ended. Renew any time from the VIP page to get your crown, orange name and cosmetics back.'
        );
      } catch (err) {
        failures.push(`${e.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  for (const w of plan.warn3) {
    if (
      await notifyOnce(
        w.id,
        vipNotificationKey('warn3', w.id, w.expiresAt),
        'VIP ends in 3 days',
        `Your Kilrun VIP ends on ${w.expiresAt.toLocaleDateString()}. Renew to keep your perks — time stacks on top of what you have left.`
      )
    ) {
      warned3 += 1;
    }
  }
  for (const w of plan.warn1) {
    if (
      await notifyOnce(
        w.id,
        vipNotificationKey('warn1', w.id, w.expiresAt),
        'VIP ends tomorrow',
        `Your Kilrun VIP ends on ${w.expiresAt.toLocaleDateString()}. Renew now so you don't lose your crown and cosmetics.`
      )
    ) {
      warned1 += 1;
    }
  }

  if (expired > 0 || failures.length > 0) {
    await writeSystemAuditLog({
      action: 'vip_expiry_run',
      detail: `expired=${expired} unequipped=${unequipped} warned3=${warned3} warned1=${warned1} failures=${failures.length}${
        failures.length ? ` first=${failures[0].slice(0, 300)}` : ''
      }`,
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    expired,
    unequipped,
    warned3,
    warned1,
    candidates: candidates.length,
    truncated: candidates.length >= MAX_PER_RUN,
    failures: failures.length,
    ms: Date.now() - started,
  });
}
