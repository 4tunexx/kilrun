/**
 * READ-ONLY. Lists every user that has a VIP flag so you can see who is permanent, who is timed,
 * and where `isVip` and `role` have drifted apart. Never writes to the database.
 *
 *   npx tsx scripts/diagnose-vip.ts > vip-report.csv
 *   npx tsx scripts/diagnose-vip.ts --help
 *
 * Needs DATABASE_URL (from .env or the environment).
 */
import 'dotenv/config';
import { isVipActive, isVipPermanent } from '../src/lib/vip';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    [
      'diagnose-vip — read-only VIP report (CSV on stdout, summary on stderr).',
      '',
      'Columns: id, username, steamId, isVip, role, vipExpiresAt, premiumExpiresAt, createdAt,',
      '         status, ownsVipCrownFrame, vipCosmeticsEquipped',
      '',
      'status: permanent | active_timed | EXPIRED_STILL_FLAGGED | drift_role_only | drift_flag_only',
      '  EXPIRED_STILL_FLAGGED = the reported bug: flagged VIP but the expiry date has passed.',
    ].join('\n')
  );
  process.exit(0);
}

function csv(v: unknown): string {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
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
    select: {
      id: true,
      username: true,
      steamId: true,
      isVip: true,
      role: true,
      vipExpiresAt: true,
      premiumExpiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const ids = users.map((u) => u.id);
  const items = ids.length
    ? await prisma.inventoryItem.findMany({
        where: { userId: { in: ids }, itemSku: { in: ['vip-crown-frame', 'vip-banner', 'vip-nickname'] } },
        select: { userId: true, itemSku: true, isEquipped: true },
      })
    : [];
  const owns = new Set(items.filter((i) => i.itemSku === 'vip-crown-frame').map((i) => i.userId));
  const equipped = new Set(items.filter((i) => i.isEquipped).map((i) => i.userId));

  const counts: Record<string, number> = {};
  console.log(
    'id,username,steamId,isVip,role,vipExpiresAt,premiumExpiresAt,createdAt,status,ownsVipCrownFrame,vipCosmeticsEquipped'
  );
  for (const u of users) {
    let status: string;
    if (u.isVip !== (u.role === 'vip') && !(u.role === 'admin' || u.role === 'moderator')) {
      status = u.role === 'vip' ? 'drift_role_only' : 'drift_flag_only';
    } else if (isVipPermanent(u)) {
      status = 'permanent';
    } else if (isVipActive(u)) {
      status = 'active_timed';
    } else {
      status = 'EXPIRED_STILL_FLAGGED';
    }
    counts[status] = (counts[status] ?? 0) + 1;
    console.log(
      [
        u.id, u.username, u.steamId, u.isVip, u.role, u.vipExpiresAt, u.premiumExpiresAt, u.createdAt,
        status, owns.has(u.id), equipped.has(u.id),
      ]
        .map(csv)
        .join(',')
    );
  }
  console.error('\n== VIP summary ==');
  console.error(`total flagged: ${users.length}`);
  for (const [k, v] of Object.entries(counts).sort()) console.error(`  ${k}: ${v}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
