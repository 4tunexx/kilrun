import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the "Set as MAIN silently reverts" race: two
// concurrent publishCloudMap calls for the same (localId, mode) — a real
// "Set as MAIN" (setActive:true) plus a stray background draft-sync
// (setActive:false) — used to each read `existing.isActive` OUTSIDE any
// transaction, so whichever one's non-transactional write landed last could
// stomp the other's result. The fix bundles the existing-row lookup and the
// write into one $transaction for every call, not just setActive:true.
//
// This fake prisma actively FAILS the test if the read ever happens on the
// bare `prisma` client instead of the transaction's `tx` client — that
// structural property (no read outside the transaction) is what actually
// closes the race, more than any single before/after value would prove.

type Row = { id: string; localId: string | null; mode: string; isActive: boolean; [k: string]: unknown };

function buildFakePrisma() {
  const rows = new Map<string, Row>();
  let nextId = 1;

  function findFirst(where: { localId?: string; mode: string; isActive?: boolean }) {
    for (const row of rows.values()) {
      if (where.localId !== undefined && row.localId !== where.localId) continue;
      if (row.mode !== where.mode) continue;
      if (where.isActive !== undefined && row.isActive !== where.isActive) continue;
      return row;
    }
    return null;
  }

  const txClient = {
    gameMap: {
      findFirst: async (args: { where: { localId?: string; mode: string } }) =>
        findFirst(args.where),
      updateMany: async (args: { where: { mode: string; isActive: boolean }; data: { isActive: boolean } }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (row.mode === args.where.mode && row.isActive === args.where.isActive) {
            row.isActive = args.data.isActive;
            count += 1;
          }
        }
        return { count };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.get(args.where.id)!;
        Object.assign(row, args.data);
        row.updatedAt = new Date();
        return row;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const row = {
          id: `map_${nextId++}`,
          updatedAt: new Date(),
          ...args.data,
        } as unknown as Row;
        rows.set(row.id, row);
        return row;
      },
    },
  };

  return {
    gameMap: {
      // Any direct (non-transactional) read/write is exactly the bug this
      // fix removes — fail loudly instead of silently "working" in the test.
      findFirst: async () => {
        throw new Error('BUG: gameMap.findFirst must run inside $transaction, not on the bare client');
      },
    },
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
    _debug: { rows },
  };
}

let fakePrisma: ReturnType<typeof buildFakePrisma>;

vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return fakePrisma;
  },
}));
vi.mock('@/lib/site-asset-upload', () => ({ persistSiteImage: vi.fn(async () => null) }));

function doc() {
  return { entities: [], layers: [] } as unknown as import('@/components/game/editor/map-document').MapDocument;
}

describe('publishCloudMapAsStaff (Set-as-MAIN race guard)', () => {
  beforeEach(() => {
    fakePrisma = buildFakePrisma();
  });

  it('a background draft-sync (setActive:false) does not revert a map that is already MAIN', async () => {
    const { publishCloudMapAsStaff } = await import('./game-map-core');
    const staff = { id: 'staff1' };

    // First: the real "Set as MAIN".
    const activated = await publishCloudMapAsStaff(staff, {
      localId: 'map-1',
      name: 'Arena',
      mode: 'deathrun',
      document: doc(),
      setActive: true,
    });
    expect(activated.isActive).toBe(true);

    // Then: a draft-sync autosave for the same map, setActive:false — this
    // is the call that used to silently flip isActive back to false when
    // it raced ahead of (or re-read stale state from before) the real publish.
    const draftSynced = await publishCloudMapAsStaff(staff, {
      localId: 'map-1',
      name: 'Arena',
      mode: 'deathrun',
      document: doc(),
      setActive: false,
    });
    expect(draftSynced.isActive).toBe(true);
  });

  it('setActive:true deactivates whatever else was MAIN for that mode', async () => {
    const { publishCloudMapAsStaff } = await import('./game-map-core');
    const staff = { id: 'staff1' };
    const first = await publishCloudMapAsStaff(staff, {
      localId: 'map-a',
      name: 'A',
      mode: 'horde',
      document: doc(),
      setActive: true,
    });
    const second = await publishCloudMapAsStaff(staff, {
      localId: 'map-b',
      name: 'B',
      mode: 'horde',
      document: doc(),
      setActive: true,
    });
    expect(second.isActive).toBe(true);
    const reread = fakePrisma._debug.rows.get(first.id)!;
    expect(reread.isActive).toBe(false);
  });

  it('a fresh draft (setActive:false, never published before) is created inactive', async () => {
    const { publishCloudMapAsStaff } = await import('./game-map-core');
    const created = await publishCloudMapAsStaff(
      { id: 'staff1' },
      { localId: 'map-new', name: 'Draft', mode: 'competitive', document: doc(), setActive: false }
    );
    expect(created.isActive).toBe(false);
  });
});
