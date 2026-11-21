# Kilrun Game Server

Authoritative real-time multiplayer server for Kilrun, built on [Colyseus](https://colyseus.io/). This is a **separate deployable** from the Next.js app in the repo root — it needs an always-on Node/WebSocket process, which Vercel’s serverless functions cannot provide.

For independent KilrunP installations, see the [hosting and setup guide](../docs/KILRUNP_INSTALL.md).

## Rooms

| Room name | Class | Notes |
| --- | --- | --- |
| `deathrun` | `DeathrunRoom` | Trapper vs runners |
| `horde` | `HordeRoom` | Co-op waves |
| `competitive` | `CompetitiveRoom` | Casual team elim |
| `competitive_ranked` | `CompetitiveRoom` | Premium/ranked; filtered by `rankKey` |

## Local development

```bash
cd server
npm install
npm run dev        # tsx watch src/index.ts → ws://localhost:2567
```

Health: `GET http://localhost:2567/healthz`.  
Monitor: `http://localhost:2567/monitor` — if `GAME_SERVER_ADMIN_SECRET` is set, requires `?secret=` or `x-admin-secret`.

Point the Next.js app at it (repo root `.env`):

```
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
WEB_APP_URL=http://localhost:3000
GAME_SERVER_ADMIN_SECRET=dev-shared-secret
GAME_JOIN_TOKEN_SECRET=dev-shared-secret
```

Use the **same** `GAME_SERVER_ADMIN_SECRET` / join secret on the Next.js `.env`.

## Production deployment

Deploy to any host that supports an always-on Node process with WebSocket support. Vercel is not suitable for this piece.

Keep the complete repository available when building: the game server imports
code from `../shared/`, so deploying only the `server/` directory is
insufficient. Install and build with `npm ci --prefix server` and
`npm run build --prefix server`, then run `npm start` with `server/` as the
working directory and the environment below supplied by the process manager.
For the KilrunP wizard's generated `server/.env`, use the Node `--env-file`
startup command in the [hosting guide](../docs/KILRUNP_INSTALL.md).

Hosts and pricing change; verify that the chosen plan supports an always-on
process, WebSocket upgrades, the full build context and a public TLS endpoint.
Services that sleep when idle can interrupt matches.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Defaults to `2567` |
| `GAME_SERVER_HOST` | No | Bind address; defaults to all interfaces. KilrunP setup uses `127.0.0.1` behind a reverse proxy |
| `CLIENT_ORIGIN` | Recommended | CORS for `/healthz`, `/monitor`, `/admin/restart`. Also fallback base URL for match-result reporting |
| `WEB_APP_URL` | **Yes for rewards** | HTTPS origin of Next.js. Colyseus POSTs to `${WEB_APP_URL}/api/game/match-result` |
| `GAME_SERVER_ADMIN_SECRET` | **Yes for prod** | Restart + match-result auth (must match web) |
| `GAME_JOIN_TOKEN_SECRET` | Recommended | Join-token HMAC (falls back to admin secret / `AUTH_SECRET`) |
| `AUTH_SECRET` | Optional | Last-resort join-token secret if others unset |

### Wiring into Next.js (Vercel)

```
NEXT_PUBLIC_GAME_SERVER_URL=wss://<your-game-server-domain>
GAME_SERVER_ADMIN_SECRET=<same as game server>
GAME_JOIN_TOKEN_SECRET=<same as game server>
```

Redeploy the Next.js app after changing `NEXT_PUBLIC_*` (inlined at build time).

### Troubleshooting

**`RangeError: Max payload size exceeded` (can't start a real match or Play Test Live)**  
Colyseus's WebSocket transport defaults to a **4KB** incoming message cap. Kilrun map pushes (`loadCustomMap`) and join skin JSON are much larger than that, so the socket is dropped as soon as the client sends the map. The server now sets `maxPayload` to 8 MiB in `server/src/index.ts`. Redeploy this service (or Admin → Dashboard → Restart Colyseus after the new build is live) for the change to take effect.

### After game-server deploy

From the hub as admin:

1. **Admin → Dashboard → Restart Colyseus** (picks up new rooms/code)
2. Confirm **Sync database schema** is up to date on the web app (match rewards / KP fields)
3. **Map Editor** → Active map per mode

## Security model

- **Join tokens**: hub mints short-lived HMAC claims (`userId`, `isAdmin`, `isPremium`, `rankedAccess`, `kp`). Rooms verify in `onAuth` when a secret is configured; without a secret (local only), rooms fall back to client options with a warning.
- **Match rewards**: server-authored via `POST /api/game/match-result` (shared admin secret). Client result screens display room awards; `record*` is a local fallback only.
- **Admin restart**: `POST /admin/restart` with `x-admin-secret` (timing-safe compare).

## Related docs

- Root [`README.md`](../README.md) — hub setup + **Admin panel / DB sync checklist**
- [`docs/AUDIT.md`](../docs/AUDIT.md)
- [`docs/MODEL_EDITOR_AND_SKINS.md`](../docs/MODEL_EDITOR_AND_SKINS.md)
