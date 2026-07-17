import { PrismaClient } from "../src/generated/prisma";
import {
  missionTemplates,
  achievements,
  badges,
  shopItems,
} from "../src/lib/progression-seed-data";

const prisma = new PrismaClient();

async function main() {
  for (const m of missionTemplates) {
    await prisma.missionTemplate.upsert({
      where: { key: m.key },
      update: m,
      create: m,
    });
  }

  for (const a of achievements) {
    await prisma.achievementDefinition.upsert({
      where: { key: a.key },
      update: a,
      create: a,
    });
  }

  for (const b of badges) {
    await prisma.badgeDefinition.upsert({
      where: { key: b.key },
      update: b,
      create: b,
    });
  }

  for (const item of shopItems) {
    await prisma.storeItem.upsert({
      where: { itemSku: item.itemSku },
      update: {
        itemName: item.itemName,
        itemCategory: item.itemCategory,
        vpPrice: item.vpPrice,
        imageUrl: item.imageUrl,
        isAvailable: true,
      },
      create: item,
    });
  }

  await prisma.siteSettings.upsert({
    where: { singletonKey: "default" },
    update: {},
    create: {
      singletonKey: "default",
      headerTitle: "Welcome to Kilrun",
      headerSubtitle:
        "The ultimate deathrun experience. Compete, conquer, and climb the ranks.",
      chatEnabled: true,
      gameDisabled: false,
    },
  });

  console.log(
    `Seeded ${missionTemplates.length} missions, ${achievements.length} achievements, ${badges.length} badges, shop, and site settings.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
