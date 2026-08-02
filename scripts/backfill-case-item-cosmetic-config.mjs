import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// One-off: existing CaseItem rows created before cosmeticSlot/bannerConfig/
// cosmeticConfig were snapshotted only have a static displayImage, which is
// empty for banners/frames/nicknames (they render from live config, not a
// static image) — so crate previews showed a generic gift icon for them.
async function main() {
  const items = await prisma.caseItem.findMany({
    where: { rewardType: 'cosmetic', storeItemSku: { not: null } },
  });
  const missing = items.filter(
    (i) => !i.cosmeticSlot && !i.bannerConfig && !i.cosmeticConfig
  );
  console.log(`Found ${missing.length} case item(s) missing cosmetic snapshot`);

  let updated = 0;
  for (const item of missing) {
    if (!item.storeItemSku) continue;
    const storeItem = await prisma.storeItem.findUnique({ where: { itemSku: item.storeItemSku } });
    if (!storeItem) continue;
    if (!storeItem.cosmeticSlot && !storeItem.bannerConfig && !storeItem.cosmeticConfig) continue;
    await prisma.caseItem.update({
      where: { id: item.id },
      data: {
        cosmeticSlot: storeItem.cosmeticSlot ?? undefined,
        bannerConfig: storeItem.bannerConfig ?? undefined,
        cosmeticConfig: storeItem.cosmeticConfig ?? undefined,
      },
    });
    updated += 1;
  }
  console.log(`Backfilled ${updated} case item(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
