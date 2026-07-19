import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$runCommandRaw({
    update: 'StoreItem',
    updates: [
      {
        q: {},
        u: [
          {
            $set: {
              createdAt: {
                $cond: [
                  { $eq: [{ $type: '$createdAt' }, 'date'] },
                  '$createdAt',
                  '$$NOW',
                ],
              },
              purchaseCount: {
                $cond: [
                  {
                    $in: [{ $type: '$purchaseCount' }, ['int', 'long', 'double']],
                  },
                  { $toInt: '$purchaseCount' },
                  0,
                ],
              },
              fireSalePercent: {
                $cond: [
                  {
                    $in: [
                      { $type: '$fireSalePercent' },
                      ['int', 'long', 'double'],
                    ],
                  },
                  { $toInt: '$fireSalePercent' },
                  0,
                ],
              },
            },
          },
        ],
        multi: true,
      },
    ],
  });
  console.log('update result', JSON.stringify(result, null, 2));

  const items = await prisma.storeItem.findMany({ take: 10 });
  console.log(
    'ok',
    items.map((i) => ({
      name: i.itemName,
      createdAt: i.createdAt,
      purchaseCount: i.purchaseCount,
      fireSalePercent: i.fireSalePercent,
      fireSaleEndsAt: i.fireSaleEndsAt,
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
