/**
 * Report finished match results from Colyseus → Next.js `/api/game/match-result`.
 * When WEB_APP_URL / CLIENT_ORIGIN or GAME_SERVER_ADMIN_SECRET are missing,
 * returns null so rooms can fill display-only XP/VP for the results UI.
 */

export type MatchReportMode =
  | 'deathrun'
  | 'horde'
  | 'competitive'
  | 'competitive_ranked';

export type MatchReportPlayer = {
  userId: string;
  role: string;
  isAlive: boolean;
  hasFinished?: boolean;
  kills?: number;
  score?: number;
  distance?: number;
  wavesCleared?: number;
  opponentAvgKp?: number;
  roundsWon?: number;
  roundsLost?: number;
};

export type MatchReportPayload = {
  matchId: string;
  mode: MatchReportMode;
  winnerRole: string;
  queue?: 'casual' | 'ranked';
  room?: {
    wave?: number;
    teamKills?: number;
    scoreA?: number;
    scoreB?: number;
  };
  players: MatchReportPlayer[];
};

export type PlayerAward = {
  userId: string;
  xpEarned: number;
  vpEarned: number;
  kpDelta: number;
  kp: number;
  rank: string;
};

/** Display-only reward tables (must stay in sync with src/lib/match-rewards.ts). */
export const DISPLAY_DEATHRUN_REWARDS: Record<
  string,
  { xp: number; vp: number }
> = {
  win: { xp: 150, vp: 40 },
  survived: { xp: 90, vp: 20 },
  loss: { xp: 40, vp: 10 },
  eliminated: { xp: 25, vp: 5 },
};

export const DISPLAY_HORDE_REWARDS: Record<string, { xp: number; vp: number }> = {
  win: { xp: 160, vp: 45 },
  survived: { xp: 110, vp: 30 },
  loss: { xp: 45, vp: 12 },
  eliminated: { xp: 30, vp: 8 },
};

export const DISPLAY_COMPETITIVE_REWARDS = {
  win: { xp: 140, vp: 35 },
  loss: { xp: 50, vp: 12 },
} as const;

export function displayDeathrunOutcome(
  winnerRole: string,
  role: string,
  isAlive: boolean
): 'win' | 'loss' | 'eliminated' {
  if (winnerRole === role) return 'win';
  if (!isAlive) return 'eliminated';
  return 'loss';
}

export function displayHordeOutcome(
  winnerRole: string,
  isAlive: boolean
): 'win' | 'loss' | 'survived' | 'eliminated' {
  const survived = winnerRole === 'survivor';
  if (survived) return isAlive ? 'win' : 'survived';
  return isAlive ? 'loss' : 'eliminated';
}

export function displayCompetitiveOutcome(
  winnerRole: string,
  role: string
): 'win' | 'loss' {
  return winnerRole === role ? 'win' : 'loss';
}

function resolveWebAppUrl(): string | null {
  const raw =
    (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  // Strip trailing slash; ignore websocket URLs.
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

/**
 * POST match results to Next.js. Returns awards or null when offline / misconfigured.
 */
export async function reportMatchResults(
  payload: MatchReportPayload
): Promise<{ players: PlayerAward[] } | null> {
  const base = resolveWebAppUrl();
  const secret = (process.env.GAME_SERVER_ADMIN_SECRET || '').trim();
  if (!base || !secret) {
    return null;
  }

  const url = `${base}/api/game/match-result`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-secret': secret,
      },
      body: JSON.stringify({ ...payload, secret }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[match-report] ${res.status} from ${url}: ${text.slice(0, 200)}`
      );
      return null;
    }

    const data = (await res.json()) as {
      ok?: boolean;
      players?: PlayerAward[];
    };
    if (!data?.ok || !Array.isArray(data.players)) {
      console.error('[match-report] unexpected response', data);
      return null;
    }
    return { players: data.players };
  } catch (err) {
    console.error('[match-report] failed:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Apply awards onto player-like objects keyed by userId. */
export function applyAwardsByUserId<
  T extends {
    userId: string;
    xpEarned: number;
    vpEarned: number;
    kpDelta: number;
    kp?: number;
  },
>(players: Iterable<T>, awards: PlayerAward[] | null | undefined) {
  if (!awards?.length) return;
  const byUser = new Map(awards.map((a) => [a.userId, a]));
  for (const player of players) {
    const a = byUser.get(player.userId);
    if (!a) continue;
    player.xpEarned = a.xpEarned;
    player.vpEarned = a.vpEarned;
    player.kpDelta = a.kpDelta;
    if (typeof a.kp === 'number') player.kp = a.kp;
  }
}
