# Kilrun Game Server

Authoritative real-time multiplayer server for Kilrun, built on [Colyseus](https://colyseus.io/). This is a **separate deployable** from the Next.js app in the repo root -- it needs an always-on Node/WebSocket process, which Vercel's serverless functions cannot provide.

Phase 1 ships one room type: `deathrun` (`src/rooms/DeathrunRoom.ts`). Horde and Competitive will add their own room classes on top of the same schema/sim foundation (`src/schema`, `src/sim`).

## Local development

```bash
cd server
npm install
npm run dev        # tsx watch src/index.ts, listens on ws://localhost:2567
```

Health check: `GET http://localhost:2567/healthz`. Room state debug view: `http://localhost:2567/monitor` (not linked from the game itself -- for local debugging only, do not expose `/monitor` publicly in production without adding auth).

Point the Next.js app at it by setting, in the repo root `.env`:

```
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
```

## Production deployment

Deploy to any host that supports an always-on Node process with WebSocket support. Vercel is not suitable for this piece.

> **Note on "free" hosting (as of 2026):** Fly.io removed its permanent free tier in 2024 -- new accounts only get a one-time trial (2 VM-hours or 7 days), then require a credit card. If you want something genuinely free with no card, use **Koyeb** (Option A). If you don't mind a few dollars/month, Fly.io (Option B) or Railway (Option C) are fine too.

### Option A: Koyeb (genuinely free tier, no credit card)

Koyeb gives every account one free Web Service forever: 512MB RAM / 0.1 vCPU, deployed from this repo's `Dockerfile`. Caveat: the free instance scales to zero after **1 hour with no traffic/connections**, with a 1-5s cold start on the next connection (occasionally the very first wake-up connection gets cut short and the client just needs to reconnect) -- fine for a hobby/testing deployment, not for guaranteeing zero-latency joins at all times.

1. Push this repo to GitHub (if not already).
2. On [koyeb.com](https://www.koyeb.com), create a new Service -> "GitHub" -> select the repo -> set **Root directory** to `/server` (Koyeb auto-detects the `Dockerfile`).
3. Pick the **Free** instance type and a region (Frankfurt or Washington, D.C. only on the free tier).
4. Add the `CLIENT_ORIGIN` environment variable (see below) set to your Vercel domain.
5. Deploy. Koyeb assigns a public domain like `https://<app>-<org>.koyeb.app`; use `wss://<that-domain>` as the client's game server URL.

### Option B: Fly.io (paid after trial)

```bash
cd server
fly launch --no-deploy   # creates fly.toml, pick a region close to your players
fly secrets set CLIENT_ORIGIN=https://your-nextjs-app.vercel.app
fly deploy
```

`fly launch` detects the included `Dockerfile` automatically. Make sure the generated `fly.toml` exposes the internal port `2567` (matches `EXPOSE 2567` in the `Dockerfile`) and enables `[[services]]` with `protocol = "tcp"` for WebSocket traffic (not just HTTP), e.g.:

```toml
[[services]]
  internal_port = 2567
  protocol = "tcp"
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  [[services.ports]]
    port = 80
    handlers = ["http"]
```

Your public URL will be `wss://<app-name>.fly.dev`. Requires a credit card once the free trial (2 VM-hours / 7 days) runs out.

### Option C: Railway (30-day trial credit, then paid)

1. Create a new Railway project, "Deploy from GitHub repo", and set the **root directory** to `/server` (Railway builds from the `Dockerfile` automatically).
2. Add the `CLIENT_ORIGIN` environment variable (see below).
3. Railway assigns a public domain automatically; use `wss://<your-railway-domain>` as the client's game server URL.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Defaults to `2567`. Most hosts inject this automatically. |
| `CLIENT_ORIGIN` | Recommended | CORS allow-origin for the HTTP endpoints (`/healthz`, `/monitor`, `/admin/restart`). Set to your deployed Next.js origin, e.g. `https://kilrun.vercel.app`. Defaults to `*` if unset. Also used as a fallback base URL for match-result reporting when `WEB_APP_URL` is unset. |
| `WEB_APP_URL` | Recommended | HTTPS (or http://localhost) origin of the Next.js app. Colyseus POSTs finished-match rewards to `${WEB_APP_URL}/api/game/match-result`. Example local: `http://localhost:3000`. |
| `GAME_SERVER_ADMIN_SECRET` | Recommended | Shared secret for `POST /admin/restart` and for authorizing match-result POSTs to Next.js (must match the Next.js env of the same name). |

### Wiring the deployed server into the Next.js app

In your Vercel project's environment variables, set:

```
NEXT_PUBLIC_GAME_SERVER_URL=wss://<your-game-server-domain>
```

This is read client-side in `src/components/game/net/connection.ts` (`resolveGameServerUrl`). Redeploy the Next.js app after setting it -- `NEXT_PUBLIC_*` vars are inlined at build time.

## Known Phase 1 limitations (documented, not silently ignored)

- **Trust model**: the room trusts whatever `userId`/`username` the client sends at join time (`onJoin` options) -- there's no signed token proving the connecting client actually owns that Steam-authenticated session. Fine for a Phase 1 foundation; harden later with a short-lived signed token minted by a Next.js API route and verified here before `onJoin` accepts it.
- **No client-side prediction/reconciliation**: movement is 100% server-authoritative with no local extrapolation, so players will feel one network round-trip of input lag. Acceptable for proving the networking pipe; revisit once Deathrun's feel needs polishing.
- **Single hardcoded track**: `src/sim/deathrun-map.ts` defines one Deathrun layout. Multiple maps/track variety (per the original 21-section wishlist) come later.
- **Weapon / skin combat**: trapper hitscan still uses fixed `HITSCAN_RANGE` / `HITSCAN_DAMAGE`. Model Editor weapon skins store range/damage for a later pass; remote players do not yet receive each other's shop-equipped skins via room state. See [`docs/MODEL_EDITOR_AND_SKINS.md`](../docs/MODEL_EDITOR_AND_SKINS.md).
