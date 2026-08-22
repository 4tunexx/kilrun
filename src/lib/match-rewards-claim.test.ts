import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma';

// claimMatchResult is the actual race guard behind the double-claim bug: two
// concurrent match-result POSTs for the same (userId, matchId) used to both
// pass a "does a MatchResult exist yet?" read before either write committed,
// double-granting VP/XP/KP. This fakes just enough of Prisma to prove the
// fix — a real unique index rejecting the loser's insert inside a
// transaction — without touching a real database.

type FakeMatchResult = { id: string; [key: string]: unknown };
type FakeClaim = { id: string; userId: string; matchId: string; matchResultId: string };

function buildFakePrisma() {
  const matchResults = new Map<string, FakeMatchResult>();
  const claims = new Map<string, FakeClaim>(); // key: `${userId}:${matchId}`
  let nextId = 1;

  const matchResult = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: FakeMatchResult = { id: `mr_${nextId++}`, ...data };
      matchResults.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      matchResults.get(where.id) ?? null,
  };

  const matchRewardClaim = {
    create: async ({ data }: { data: { userId: string; matchId: string; matchResultId: string } }) => {
      const key = `${data.userId}:${data.matchId}`;
      if (claims.has(key)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeClaim = { id: `claim_${nextId++}`, ...data };
      claims.set(key, row);
      return row;
    },
    findUnique: async ({
      where,
    }: {
      where: { userId_matchId: { userId: string; matchId: string } };
    }) => claims.get(`${where.userId_matchId.userId}:${where.userId_matchId.matchId}`) ?? null,
  };

  // Real Mongo transactions roll back every write in the callback if it
  // throws — fake that here so a failed claim doesn't leave an orphaned
  // MatchResult behind, matching production behavior.
  const $transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const before = new Set(matchResults.keys());
    try {
      return await fn({ matchResult, matchRewardClaim });
    } catch (err) {
      for (const id of matchResults.keys()) {
        if (!before.has(id)) matchResults.delete(id);
      }
      throw err;
    }
  };

  return { matchResult, matchRewardClaim, $transaction, _debug: { matchResults, claims } };
}

let fakePrisma: ReturnType<typeof buildFakePrisma>;

vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return fakePrisma;
  },
}));

// claimMatchResult doesn't touch any of these — they're only mocked so
// importing match-rewards.ts doesn't drag in next-auth's Next.js runtime
// imports (which don't resolve under Vitest's plain node environment).
vi.mock('@/lib/progression-actions', () => ({
  applyKpDelta: vi.fn(),
  grantXp: vi.fn(),
  processMatchProgression: vi.fn(),
  getSiteSettings: vi.fn(async () => ({})),
}));
vi.mock('@/lib/trusted-server', () => ({
  runAsTrustedServer: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/game-progression-core', () => ({
  grantGameXpToUser: vi.fn(),
}));

describe('claimMatchResult (match-reward double-claim guard)', () => {
  beforeEach(() => {
    fakePrisma = buildFakePrisma();
    vi.resetModules();
  });

  it('the second concurrent claim for the same match gets the first result back, not a new one', async () => {
    const { claimMatchResult } = await import('./match-rewards');
    const data = {
      mode: 'deathrun',
      outcome: 'win',
      xpEarned: 100,
      vpEarned: 50,
      stats: { matchId: 'match-1' },
    };

    const [a, b] = await Promise.all([
      claimMatchResult('match-1', 'user-1', data),
      claimMatchResult('match-1', 'user-1', data),
    ]);

    const winners = [a, b].filter((r) => r.isNewClaim);
    const losers = [a, b].filter((r) => !r.isNewClaim);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    // The loser must be handed the winner's exact row, not a fresh one.
    expect(losers[0].row.id).toBe(winners[0].row.id);
    expect(fakePrisma._debug.matchResults.size).toBe(1);
  });

  it('a different matchId for the same user claims independently', async () => {
    const { claimMatchResult } = await import('./match-rewards');
    const data = { mode: 'deathrun', outcome: 'win', xpEarned: 10, vpEarned: 5, stats: {} };
    const a = await claimMatchResult('match-A', 'user-1', data);
    const b = await claimMatchResult('match-B', 'user-1', data);
    expect(a.isNewClaim).toBe(true);
    expect(b.isNewClaim).toBe(true);
    expect(a.row.id).not.toBe(b.row.id);
  });
});
