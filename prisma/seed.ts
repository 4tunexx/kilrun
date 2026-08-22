import { PrismaClient } from "../src/generated/prisma";
import {
  missionTemplates,
  achievements,
  badges,
  shopItems,
} from "../src/lib/progression-seed-data";
import { STATIC_FALLBACK_POWERS } from "../shared/power-definitions";
import { STATIC_FALLBACK_WEAPONS } from "../src/lib/weapon-catalog";
import { seedMissingSoundDefinitions } from "../src/lib/sound-pack-seed";

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

  // Seed the 11 original in-game "Powers" as isCore=true rows so the Power
  // Editor / dynamic loader has real data from day one. Idempotent: only
  // CREATES rows that don't exist yet — never overwrites an admin's tuned
  // numbers on a re-run (matches the siteSettings upsert pattern above).
  for (const power of STATIC_FALLBACK_POWERS) {
    await prisma.powerDefinition.upsert({
      where: { key: power.key },
      update: {},
      create: {
        key: power.key,
        name: power.name,
        description: power.description,
        icon: power.icon,
        maxLevel: power.maxLevel,
        unlockLevel: power.unlockLevel,
        prerequisitesJson: JSON.stringify(power.prerequisites),
        costJson: JSON.stringify(power.cost),
        effectType: power.effectType,
        effectParamsJson: JSON.stringify(power.effectParams),
        isCore: true,
        sortOrder: power.sortOrder,
      },
    });
  }

  // Seed the 8 original catalog weapons as isCore=true rows so the global
  // Weapon Catalog admin panel / dynamic loader has real data from day one.
  // Idempotent: only CREATES rows that don't exist yet — never overwrites an
  // admin's already-tuned stats on a re-run.
  for (const weapon of STATIC_FALLBACK_WEAPONS) {
    await prisma.weaponDefinition.upsert({
      where: { key: weapon.id },
      update: {},
      create: {
        key: weapon.id,
        label: weapon.label,
        modelUrl: weapon.modelUrl,
        kind: weapon.kind,
        combatJson: JSON.stringify(weapon.combat),
        modesJson: JSON.stringify(weapon.modes),
        gripHint: weapon.gripHint,
        unlockMetric: weapon.unlockMetric ?? null,
        unlockAmount: typeof weapon.unlockAmount === "number" ? weapon.unlockAmount : null,
        isCore: true,
        sortOrder: weapon.sortOrder ?? 0,
      },
    });
  }

  const soundsCreated = await seedMissingSoundDefinitions(prisma);

  console.log(
    `Seeded ${missionTemplates.length} missions, ${achievements.length} achievements, ${badges.length} badges, ${STATIC_FALLBACK_POWERS.length} core powers, ${STATIC_FALLBACK_WEAPONS.length} core weapons, ${soundsCreated} sound pack bindings, shop, and site settings.`
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
