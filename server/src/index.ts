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

// Lightweight room-state dashboard for local debugging; not linked from the game itself.
app.use('/monitor', monitor());

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('deathrun', DeathrunRoom);
gameServer.define('horde', HordeRoom);
gameServer.define('competitive', CompetitiveRoom);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kilrun game server listening on ws://localhost:${PORT}`);
});
