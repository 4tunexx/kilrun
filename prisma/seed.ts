import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const storeCatalog = [
  { itemName: 'Cyber Blade Skin', itemCategory: 'Weapon Skin', itemSku: 'SKIN-CYBER-BLADE', vpPrice: 1999 },
  { itemName: 'Neon Runner Pack', itemCategory: 'Bundle', itemSku: 'BUNDLE-NEON-RUNNER', vpPrice: 2499 },
  { itemName: 'Quantum Armor', itemCategory: 'Outfit', itemSku: 'OUTFIT-QUANTUM-ARMOR', vpPrice: 1499 },
  { itemName: 'Holographic Emote', itemCategory: 'Emote', itemSku: 'EMOTE-HOLOGRAPHIC', vpPrice: 599 },
  { itemName: 'Dragonfire Shotgun', itemCategory: 'Weapon Skin', itemSku: 'SKIN-DRAGONFIRE-SHOTGUN', vpPrice: 2199 },
  { itemName: 'Celestial Wings', itemCategory: 'Back Bling', itemSku: 'BLING-CELESTIAL-WINGS', vpPrice: 1899 },
  { itemName: 'Void Reaver Knife', itemCategory: 'Melee', itemSku: 'MELEE-VOID-REAVER', vpPrice: 1799 },
  { itemName: 'Chrono-Guardian Set', itemCategory: 'Bundle', itemSku: 'BUNDLE-CHRONO-GUARDIAN', vpPrice: 3499 },
];

async function main() {
  for (const item of storeCatalog) {
    await prisma.storeItem.upsert({
      where: { itemSku: item.itemSku },
      update: item,
      create: item,
    });
  }
  console.log(`Seeded ${storeCatalog.length} store items.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
