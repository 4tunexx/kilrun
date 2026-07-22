# Kilrun Game Server

Authoritative real-time multiplayer server for Kilrun, built on [Colyseus](https://colyseus.io/). This is a **separate deployable** from the Next.js app in the repo root — it needs an always-on Node/WebSocket process, which Vercel’s serverless functions cannot provide.

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

> **Note on "free" hosting (as of 2026):** Fly.io removed its permanent free tier in 2024 — new accounts only get a one-time trial. For genuinely free (no card), use **Koyeb** (Option A). Fly.io / Railway are fine if you can pay a few dollars/month.

### Option A: Koyeb (free tier)

1. Push this repo to GitHub.
2. On [koyeb.com](https://www.koyeb.com): new Service → GitHub → **Root directory** `/server`.
3. Free instance; set env vars below (`CLIENT_ORIGIN`, `WEB_APP_URL`, secrets).
4. Public URL → use `wss://…` as `NEXT_PUBLIC_GAME_SERVER_URL` on Vercel.

### Option B: Fly.io

```bash
cd server
fly launch --no-deploy
fly secrets set CLIENT_ORIGIN=https://your-nextjs-app.vercel.app
fly secrets set WEB_APP_URL=https://your-nextjs-app.vercel.app
fly secrets set GAME_SERVER_ADMIN_SECRET=...
fly secrets set GAME_JOIN_TOKEN_SECRET=...
fly deploy
```

Expose internal port `2567` with TCP/HTTP+TLS handlers (see Dockerfile `EXPOSE 2567`).

### Option C: Railway

1. Deploy from GitHub, root directory `/server`.
2. Set the same env vars as above.
3. Use `wss://<railway-domain>` on the Next.js app.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Defaults to `2567` |
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
