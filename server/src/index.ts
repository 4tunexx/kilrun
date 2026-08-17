import http from 'http';
import { timingSafeEqual } from 'crypto';
import express from 'express';
import cors from 'cors';
import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import { DeathrunRoom } from './rooms/DeathrunRoom.js';
import { DeathrunPracticeRoom } from './rooms/DeathrunPracticeRoom.js';
import { HordeRoom } from './rooms/HordeRoom.js';
import { HordePracticeRoom } from './rooms/HordePracticeRoom.js';
import { CompetitiveRoom } from './rooms/CompetitiveRoom.js';
import { CompetitivePracticeRoom } from './rooms/CompetitivePracticeRoom.js';
import { isJoinTokenRequired } from './join-token.js';

/** The 3 room classes all expose this same admin control surface (kept as
 * plain duck-typing rather than a shared base class, matching how the rest
 * of the room code is structured — each room stays independently readable). */
interface AdminControllableRoom {
  adminPause(): void;
  adminResume(): void;
  adminCancelMatch(): void;
  adminBroadcastMessage(text: string): void;
  adminGetPlayerSteamId(sessionId: string): string;
  adminKickPlayer(targetSessionId: string): boolean;
  adminMutePlayer(targetSessionId: string, minutes?: number): boolean;
  adminBanPlayer(
    targetSessionId: string,
    actor: { userId: string; username: string },
    reason?: string
  ): Promise<{ ok: boolean; error?: string }>;
}

const PORT = Number(process.env.PORT ?? 2567);
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';

// join-token.ts's authenticateJoin() has a dev-only fallback: when no join
// secret is configured at all, it trusts options.isAdmin/isStaff/kp straight
// from the client instead of a verified token — a full privilege-escalation
// hole (anyone can self-assert isAdmin:true). That fallback is explicitly
// documented as dev-only but was previously just a silent warn-once, one
// missing env var away from shipping live. Fail fast instead.
if (process.env.NODE_ENV === 'production' && !isJoinTokenRequired()) {
  console.error(
    '[server] Refusing to start in production with no join-token secret configured. ' +
      'Set GAME_JOIN_TOKEN_SECRET (or GAME_SERVER_ADMIN_SECRET / AUTH_SECRET) before deploying — ' +
      'without one, every client join is trusted at face value for admin/staff/kp claims.'
  );
  process.exit(1);
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: process.uptime() });
});

/**
 * Soft-restart Colyseus: exits so the process manager (tsx watch / Docker / Fly / Railway)
 * brings the server back up. Protected by GAME_SERVER_ADMIN_SECRET.
 */
app.post('/admin/restart', (req, res) => {
  const secret = process.env.GAME_SERVER_ADMIN_SECRET || '';
  const provided =
    (typeof req.headers['x-admin-secret'] === 'string'
      ? req.headers['x-admin-secret']
      : '') ||
    (typeof req.body?.secret === 'string' ? req.body.secret : '');

  if (!secret) {
    res.status(503).json({
      ok: false,
      error: 'GAME_SERVER_ADMIN_SECRET is not configured on the game server',
    });
    return;
  }
  if (!provided || !secretsEqual(provided, secret)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  res.json({ ok: true, restarting: true, uptimeSeconds: process.uptime() });
  // Let the response flush, then exit so the host restarts the process.
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log('[game-server] admin restart requested — exiting');
    process.exit(0);
  }, 250);
});

/** Shared secret check for the /admin/live-matches routes below. */
function requireAdminSecret(req: express.Request, res: express.Response): boolean {
  const secret = process.env.GAME_SERVER_ADMIN_SECRET || '';
  const provided =
    (typeof req.headers['x-admin-secret'] === 'string'
      ? req.headers['x-admin-secret']
      : '') || (typeof req.body?.secret === 'string' ? req.body.secret : '');
  if (!secret) {
    res.status(503).json({
      ok: false,
      error: 'GAME_SERVER_ADMIN_SECRET is not configured on the game server',
    });
    return false;
  }
  if (!provided || !secretsEqual(provided, secret)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Live match visibility + control for the website's Admin -> Live tab.
 * Single-process deployment (see server/README.md) — matchMaker.query()
 * and getLocalRoomById() both operate on this same process's in-memory
 * rooms, no cross-process presence/remoteRoomCall needed.
 */
app.get('/admin/live-matches', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  // Express 5 auto-forwards a rejected async-handler promise to the default
  // error handler (no explicit try/catch needed to avoid a hung request),
  // but that default handler returns an HTML error page — inconsistent with
  // every other route here returning {ok, error} JSON. Explicit catch for a
  // consistent response shape.
  try {
    const cached = await matchMaker.query({});
    const matches = cached.map((c) => {
      const room = matchMaker.getLocalRoomById(c.roomId) as unknown as
        | (AdminControllableRoom & {
            state?: {
              phase?: string;
              modeTag?: string;
              adminPaused?: boolean;
              players?: Map<string, { username?: string; role?: string; avatarUrl?: string }>;
            };
          })
        | undefined;
      const state = room?.state;
      const players = state?.players
        ? Array.from(state.players.entries()).map(([sessionId, p]) => ({
            sessionId,
            username: p.username ?? 'Player',
            role: p.role ?? '',
            avatarUrl: p.avatarUrl ?? '',
            steamId: room?.adminGetPlayerSteamId(sessionId) ?? '',
          }))
        : [];
      return {
        roomId: c.roomId,
        roomName: c.name,
        mode: state?.modeTag ?? c.name,
        phase: state?.phase ?? 'unknown',
        paused: !!state?.adminPaused,
        playerCount: players.length,
        players,
      };
    });
    res.json({ ok: true, matches });
  } catch (err) {
    console.error('[admin] /admin/live-matches failed', err);
    res.status(500).json({ ok: false, error: 'Failed to query matches' });
  }
});

app.post('/admin/live-matches/:roomId/pause', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  room.adminPause();
  res.json({ ok: true });
});

app.post('/admin/live-matches/:roomId/resume', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  room.adminResume();
  res.json({ ok: true });
});

app.post('/admin/live-matches/:roomId/cancel', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  room.adminCancelMatch();
  res.json({ ok: true });
});

app.post('/admin/live-matches/:roomId/message', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 240) : '';
  if (!text) {
    res.status(400).json({ ok: false, error: 'text is required' });
    return;
  }
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  room.adminBroadcastMessage(text);
  res.json({ ok: true });
});

app.post('/admin/live-matches/:roomId/kick', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const targetSessionId =
    typeof req.body?.targetSessionId === 'string' ? req.body.targetSessionId : '';
  if (!targetSessionId) {
    res.status(400).json({ ok: false, error: 'targetSessionId is required' });
    return;
  }
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  const ok = room.adminKickPlayer(targetSessionId);
  res.json({ ok, error: ok ? undefined : 'Player not connected' });
});

app.post('/admin/live-matches/:roomId/mute', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const targetSessionId =
    typeof req.body?.targetSessionId === 'string' ? req.body.targetSessionId : '';
  const minutes = Number(req.body?.minutes) || 5;
  if (!targetSessionId) {
    res.status(400).json({ ok: false, error: 'targetSessionId is required' });
    return;
  }
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  const ok = room.adminMutePlayer(targetSessionId, minutes);
  res.json({ ok, error: ok ? undefined : 'Player not in this match' });
});

app.post('/admin/live-matches/:roomId/ban', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const targetSessionId =
    typeof req.body?.targetSessionId === 'string' ? req.body.targetSessionId : '';
  const actorUserId = typeof req.body?.actorUserId === 'string' ? req.body.actorUserId : '';
  const actorUsername =
    typeof req.body?.actorUsername === 'string' ? req.body.actorUsername : 'Admin';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
  if (!targetSessionId || !actorUserId) {
    res.status(400).json({ ok: false, error: 'targetSessionId and actorUserId are required' });
    return;
  }
  const room = matchMaker.getLocalRoomById(req.params.roomId) as unknown as
    | AdminControllableRoom
    | undefined;
  if (!room) {
    res.status(404).json({ ok: false, error: 'Match not found on this process' });
    return;
  }
  try {
    const result = await room.adminBanPlayer(
      targetSessionId,
      { userId: actorUserId, username: actorUsername },
      reason
    );
    res.json(result);
  } catch (err) {
    console.error('[admin] adminBanPlayer failed', err);
    res.status(500).json({ ok: false, error: 'Ban failed' });
  }
});

// Lightweight room-state dashboard for local debugging; not linked from the game itself.
// Every other admin route (requireAdminSecret above) fails CLOSED — 503 —
// when GAME_SERVER_ADMIN_SECRET isn't set. This one only registered its auth
// check `if (adminSecret)`, so an unset secret meant `app.use('/monitor',
// monitor())` below ran with ZERO auth at all, exposing live room/player
// state to anyone who could reach the port. Middleware is now unconditional
// and fails closed like every other admin route.
app.use('/monitor', (req, res, next) => {
  const adminSecret = process.env.GAME_SERVER_ADMIN_SECRET || '';
  if (!adminSecret) {
    res.status(503).json({
      ok: false,
      error: 'GAME_SERVER_ADMIN_SECRET is not configured on the game server',
    });
    return;
  }
  const header =
    typeof req.headers['x-admin-secret'] === 'string'
      ? req.headers['x-admin-secret']
      : '';
  const query =
    typeof req.query.secret === 'string' ? req.query.secret : '';
  const provided = header || query;
  if (!provided || !secretsEqual(provided, adminSecret)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
});
app.use('/monitor', monitor());

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('deathrun', DeathrunRoom);
// Private, solo, no-rewards Deathrun room used only by the map editor's
// "Play Test" — same sim/HUD/chat/admin-panel code as a real match, but
// never appears in normal matchmaking (setPrivate) and never grants XP/VP.
gameServer.define('deathrun_practice', DeathrunPracticeRoom);
gameServer.define('horde', HordeRoom);
gameServer.define('horde_practice', HordePracticeRoom);
gameServer.define('competitive', CompetitiveRoom);
gameServer.define('competitive_practice', CompetitivePracticeRoom);
gameServer
  .define('competitive_ranked', CompetitiveRoom)
  .filterBy(['rankKey']);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kilrun game server listening on ws://localhost:${PORT}`);
});
