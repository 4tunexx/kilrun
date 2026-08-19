export const prisma = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error('Prisma is not available inside Kilrun Engine');
      };
    },
  }
);

export class PrismaClient {}

