import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import { DeathrunRoom } from './rooms/DeathrunRoom.js';
import { HordeRoom } from './rooms/HordeRoom.js';
import { CompetitiveRoom } from './rooms/CompetitiveRoom.js';

const PORT = Number(process.env.PORT ?? 2567);
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';

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
  if (!provided || provided !== secret) {
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

// Lightweight room-state dashboard for local debugging; not linked from the game itself.
app.use('/monitor', monitor());

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('deathrun', DeathrunRoom);
gameServer.define('horde', HordeRoom);
gameServer.define('competitive', CompetitiveRoom);
gameServer
  .define('competitive_ranked', CompetitiveRoom)
  .filterBy(['rankKey']);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kilrun game server listening on ws://localhost:${PORT}`);
});
