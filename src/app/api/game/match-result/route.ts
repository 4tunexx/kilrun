import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyServerMatchBatch,
  derivePlayerOutcome,
  type MatchRewardMode,
  type ServerMatchPlayerInput,
} from '@/lib/match-rewards';

export const runtime = 'nodejs';

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type BodyPlayer = {
  userId?: string;
  role?: string;
  isAlive?: boolean;
  hasFinished?: boolean;
  kills?: number;
  score?: number;
  distance?: number;
  wavesCleared?: number;
  opponentAvgKp?: number;
  roundsWon?: number;
  roundsLost?: number;
};

type Body = {
  secret?: string;
  matchId?: string;
  mode?: string;
  winnerRole?: string;
  queue?: 'casual' | 'ranked';
  room?: {
    wave?: number;
    teamKills?: number;
    scoreA?: number;
    scoreB?: number;
  };
  players?: BodyPlayer[];
};

const MODES = new Set<MatchRewardMode>([
  'deathrun',
  'horde',
  'competitive',
  'competitive_ranked',
]);

export async function POST(req: NextRequest) {
  const expected = process.env.GAME_SERVER_ADMIN_SECRET || '';
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'GAME_SERVER_ADMIN_SECRET is not configured' },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const headerSecret = req.headers.get('x-admin-secret') || '';
  const bodySecret = typeof body.secret === 'string' ? body.secret : '';
  const provided = headerSecret || bodySecret;
  if (!provided || !secretsEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
  const modeRaw = typeof body.mode === 'string' ? body.mode : '';
  if (!matchId || !MODES.has(modeRaw as MatchRewardMode)) {
    return NextResponse.json(
      { ok: false, error: 'matchId and valid mode are required' },
      { status: 400 }
    );
  }
  const mode = modeRaw as MatchRewardMode;
  const winnerRole = typeof body.winnerRole === 'string' ? body.winnerRole : '';
  const queue =
    body.queue === 'ranked' || body.queue === 'casual'
      ? body.queue
      : mode === 'competitive_ranked'
        ? 'ranked'
        : 'casual';

  const rawPlayers = Array.isArray(body.players) ? body.players : [];
  const players: ServerMatchPlayerInput[] = rawPlayers
    .filter((p) => p && typeof p.userId === 'string' && p.userId.length > 0)
    .map((p) => {
      const role = typeof p.role === 'string' ? p.role : 'runner';
      const isAlive = !!p.isAlive;
      const outcome = derivePlayerOutcome({
        mode,
        winnerRole,
        role,
        isAlive,
        hasFinished: !!p.hasFinished,
      });

      const wavesCleared =
        typeof p.wavesCleared === 'number'
          ? p.wavesCleared
          : mode === 'horde'
            ? Math.max(
                0,
                (body.room?.wave ?? 1) - (winnerRole === 'survivor' ? 0 : 1)
              )
            : undefined;

      const roundsWon =
        typeof p.roundsWon === 'number'
          ? p.roundsWon
          : role === 'team_a'
            ? body.room?.scoreA
            : role === 'team_b'
              ? body.room?.scoreB
              : undefined;
      const roundsLost =
        typeof p.roundsLost === 'number'
          ? p.roundsLost
          : role === 'team_a'
            ? body.room?.scoreB
            : role === 'team_b'
              ? body.room?.scoreA
              : undefined;

      return {
        userId: p.userId as string,
        role,
        outcome,
        score: typeof p.score === 'number' ? p.score : undefined,
        distance: typeof p.distance === 'number' ? p.distance : undefined,
        kills: typeof p.kills === 'number' ? p.kills : undefined,
        wavesCleared,
        opponentAvgKp:
          typeof p.opponentAvgKp === 'number' ? p.opponentAvgKp : undefined,
        roundsWon,
        roundsLost,
        queue,
      };
    });

  try {
    const awards = await applyServerMatchBatch({ matchId, mode, players });
    return NextResponse.json({ ok: true, ...awards });
  } catch (err) {
    console.error('[api/game/match-result]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    );
  }
}
