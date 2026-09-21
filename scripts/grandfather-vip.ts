/**
 * One-off migration: "VIP is now a monthly membership".
 * Gives legacy PERMANENT VIPs (flagged, no expiry) a grace period, then normal expiry rules apply.
 *
 *   npx tsx scripts/grandfather-vip.ts                       # DRY RUN (default, writes nothing)
 *   npx tsx scripts/grandfather-vip.ts --grace-days 45
 *   npx tsx scripts/grandfather-vip.ts --exclude-file keep.csv
 *   CONFIRM_GRANDFATHER=yes npx tsx scripts/grandfather-vip.ts --apply   # actually writes
 *
 * Never touches admin/moderator, users who already have an expiry, or --exclude-file ids
 * (CSV/newline list of user ids: staff, giveaway winners, partners that must stay permanent).
 * Idempotent: re-running skips anyone already given a date.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DEFAULT_GRACE_DAYS, parseExcludeList, planGrandfather } from '../src/lib/vip-grandfather';
import { vipNotificationKey } from '../src/lib/vip-expiry';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag('--help') || flag('-h')) {
  console.log(
    `grandfather-vip [--apply] [--grace-days N (default ${DEFAULT_GRACE_DAYS})] [--exclude-file path]\n` +
      'Default is a dry run. --apply also requires the env var CONFIRM_GRANDFATHER=yes.'
  );
  process.exit(0);
}

const apply = flag('--apply');
if (apply && process.env.CONFIRM_GRANDFATHER !== 'yes') {
  console.error('Refusing to write: set CONFIRM_GRANDFATHER=yes together with --apply.');
  process.exit(2);
}

const graceDays = Number(opt('--grace-days') ?? DEFAULT_GRACE_DAYS);
if (!Number.isFinite(graceDays) || graceDays < 1) {
  console.error('--grace-days must be a number >= 1');
  process.exit(2);
}
const excludePath = opt('--exclude-file');
const excludeIds = excludePath ? parseExcludeList(readFileSync(excludePath, 'utf8')) : [];

const SYSTEM_ACTOR_ID = '000000000000000000000000';
const CHUNK = 50;

async function main() {
  // Loaded lazily so --help and refused runs never need (or construct) a database client.
  const { PrismaClient } = await import('../src/generated/prisma');
  const prisma = new PrismaClient();
  try {
    await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function run(prisma: InstanceType<Awaited<typeof import('../src/generated/prisma')>['PrismaClient']>) {
  const users = await prisma.user.findMany({
    where: { OR: [{ isVip: true }, { role: 'vip' }] },
    select: { id: true, username: true, role: true, isVip: true, vipExpiresAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const plan = planGrandfather(users, { graceDays, excludeIds });
  const reasons: Record<string, number> = {};
  for (const s of plan.skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;

  console.log(`\nMode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
  console.log(`Grace period: ${graceDays} days   Excluded ids loaded: ${excludeIds.length}`);
  console.log(`Flagged VIP users: ${users.length}`);
  console.log(`Would receive an expiry: ${plan.apply.length}`);
  console.log(`Skipped: ${plan.skipped.length} ${JSON.stringify(reasons)}\n`);

  if (plan.apply.length > 0) {
    console.log('id                        username                  new vipExpiresAt');
    for (const a of plan.apply.slice(0, 200)) {
      console.log(`${a.id}  ${a.username.padEnd(24).slice(0, 24)}  ${a.expiresAt.toISOString()}`);
    }
    if (plan.apply.length > 200) console.log(`... and ${plan.apply.length - 200} more`);
  }

  if (!apply) {
    console.log('\nDry run only. Nothing was written. Re-run with --apply and CONFIRM_GRANDFATHER=yes to apply.');
    return;
  }

  let written = 0;
  for (let i = 0; i < plan.apply.length; i += CHUNK) {
    for (const a of plan.apply.slice(i, i + CHUNK)) {
      // Guard on "still has no expiry" so a concurrent renewal is never overwritten.
      const res = await prisma.user.updateMany({
        where: { id: a.id, vipExpiresAt: null },
        data: { isVip: true, vipExpiresAt: a.expiresAt },
      });
      if (res.count === 0) continue;
      written += 1;
      const dedupeKey = vipNotificationKey('grandfather', a.id);
      const exists = await prisma.notification.findFirst({ where: { userId: a.id, dedupeKey }, select: { id: true } });
      if (!exists) {
        await prisma.notification.create({
          data: {
            userId: a.id,
            type: 'vip',
            dedupeKey,
            title: 'Kilrun VIP is now a monthly membership',
            body: `Your VIP is now a monthly membership. Yours runs until ${a.expiresAt.toLocaleDateString()}. Renew any time to keep your crown, orange name and cosmetics — time stacks on what you have left.`,
          },
        });
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: SYSTEM_ACTOR_ID,
      actorUsername: 'system',
      action: 'vip_grandfather_run',
      detail: `written=${written} planned=${plan.apply.length} graceDays=${graceDays} excluded=${excludeIds.length}`,
    },
  });
  console.log(`\nDone. Wrote ${written} of ${plan.apply.length} planned users.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
