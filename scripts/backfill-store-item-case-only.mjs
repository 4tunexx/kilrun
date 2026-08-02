import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// One-off: sets caseOnly=false on any StoreItem missing the field, since a
// missing Boolean field is excluded (not included) by `{ not: true }` filters
// in Prisma's MongoDB connector, which was hiding every shop item.
async function main() {
  const result = await prisma.$runCommandRaw({
    update: 'StoreItem',
    updates: [
      {
        q: { caseOnly: { $exists: false } },
        u: { $set: { caseOnly: false } },
        multi: true,
      },
    ],
  });
  console.log('update result', JSON.stringify(result, null, 2));

  const total = await prisma.storeItem.count();
  const visible = await prisma.storeItem.count({ where: { caseOnly: { not: true } } });
  console.log('total store items:', total, '| visible after backfill:', visible);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
