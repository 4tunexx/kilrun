# Kilrun

Kilrun is a real-time multiplayer arcade shooter built on Next.js 15, with an authoritative Colyseus game server and a PixiJS 2.5D isometric renderer. Players sign in with Steam, optionally verify their email for a welcome bonus, and drop into fast CS 1.6-inspired game modes.

## Game modes

| Mode | Status | Description |
| --- | --- | --- |
| **Deathrun** | Live | 1 random player is the **Trapper** (controls traps), everyone else are **Runners** racing an obstacle course to the finish line. |
| **Horde** | Coming soon | Solo or co-op waves of AI enemies. |
| **Competitive** | Coming soon | 4v4 team elimination. |

## Tech stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, ShadCN UI
- **Auth**: Steam OpenID 2.0 + NextAuth.js v5 (primary login), Clerk (secondary email verification/OTP)
- **Database**: MongoDB Atlas via Prisma ORM
- **Realtime game server**: [Colyseus](https://colyseus.io/) (authoritative state sync) -- see [`server/README.md`](./server/README.md)
- **Game rendering**: [PixiJS](https://pixijs.com/) 2.5D isometric renderer, client-predicted input over a networked room

## Project structure

```
src/
  app/                        # Next.js routes (pages, API routes, webhooks)
    api/auth/steam/           # Steam OpenID login + callback
    api/webhooks/clerk/       # Syncs Clerk user.created -> MongoDB
    verify-email/             # Arcade-themed email OTP verification UI
  components/
    game/                     # Client-side game engine (mode-agnostic + Deathrun)
      net/                    # Colyseus connection + React state bridge
      renderer/               # PixiJS app bootstrap, isometric camera, sprites
      entities/                # Player/obstacle visual representations
      input/                   # Keyboard/mouse + mobile dual-joystick input
      modes/deathrun/          # Deathrun-specific HUD, lobby, countdown, results
      ui/                       # Shared HUD, crosshair
    views/                    # App screens (play, lobby, profile, dashboard)
  lib/                        # Prisma client, server actions
  auth.ts, middleware.ts       # NextAuth + Clerk middleware
prisma/
  schema.prisma               # User, Mission, MatchResult models (MongoDB)
server/                       # Separate deployable: Colyseus game server
  src/rooms/                  # Room logic (DeathrunRoom, ...)
  src/schema/                 # Networked state schema
  src/sim/                    # Server-authoritative movement/collision/maps
```

## Getting started

1. Copy `.env.example` to `.env` and fill in your own values (MongoDB Atlas connection string, Steam API key, Clerk keys, etc).
2. Install dependencies and generate the Prisma client:

   ```bash
   npm install
   npm run db:push
   ```

3. Run the Next.js app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

4. (Optional, for live Deathrun matches) Run the game server in a second terminal:

   ```bash
   cd server
   npm install
   npm run dev
   ```

   See [`server/README.md`](./server/README.md) for full game server docs and free/paid deployment options (Koyeb, Fly.io, Railway).

## Scripts

- `npm run dev` — Start the Next.js development server (Turbopack)
- `npm run build` — Create a production build
- `npm run start` — Run the production server
- `npm run lint` — Run ESLint
- `npm run typecheck` — Run TypeScript checks
- `npm run db:push` — Push the Prisma schema to MongoDB Atlas
- `npm run db:seed` — Seed the database

## Environment variables

See `.env.example` for the full list with comments. In short:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MongoDB Atlas connection string (Prisma) |
| `STEAM_API_KEY` | Recommended | Enriches player profile (username/avatar) after Steam login |
| `AUTH_SECRET` | Yes | NextAuth/Auth.js session signing secret |
| `NEXTAUTH_URL` | Local dev only | Not used to derive redirect origin/cookies in production (see note below) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `CLERK_WEBHOOK_SECRET` | Yes (for email verification) | Clerk email-OTP verification layer |
| `NEXT_PUBLIC_GAME_SERVER_URL` | Yes (for Deathrun) | WebSocket URL of the deployed Colyseus server |
| `ADMIN_STEAM_IDS` | Recommended | Comma-separated SteamID64 values promoted to `admin` on login |

> **Note on Steam auth in production**: the Steam login/callback routes derive the redirect origin and secure-cookie flag directly from the incoming request (`req.nextUrl`), not from `NEXTAUTH_URL`. This avoids a class of bugs where a stale/unset `NEXTAUTH_URL` causes Steam to redirect to the wrong domain, or the session cookie's `__Secure-` prefix to mismatch what Auth.js expects.

> **Note on Prisma + serverless**: `src/lib/prisma.ts` always caches the `PrismaClient` singleton on `globalThis`, in every environment. Vercel reuses the same warm serverless instance across requests; without this cache, each request would spin up a brand-new client with its own MongoDB connection pool that never closed, eventually exhausting Atlas's connection limit. On connection failures it recreates the client once (so a poisoned warm instance can recover) and defaults `maxPoolSize=1` on the connection string when unset.

> **MongoDB Atlas checklist (required for Steam login on Vercel)**:
> 1. **Network Access** → Add IP Access List entry `0.0.0.0/0` (allow from anywhere). Vercel serverless IPs are dynamic; locking to a single IP will cause Steam callback `prisma.user.findUnique()` to fail with `Server selection timeout` / `received fatal alert: InternalError`.
> 2. Confirm the Atlas cluster is **not paused**.
> 3. Set `DATABASE_URL` in the Vercel project env (same value as local `.env`), including `maxPoolSize=1`.
> 4. Redeploy after changing Atlas Network Access or `DATABASE_URL`.

## Deployment

- **Production domain**: set Vercel **Production Branch** to `main`. Only merges into `main` update `https://kilrun.vercel.app/`. Pull request previews use temporary URLs like `kilrun-xxx.vercel.app` — those are for testing, not the live site.
- After merging a PR: Vercel auto-deploys Production to `kilrun.vercel.app` (or trigger **Redeploy** on the Production deployment).
- **Frontend**: deploy to Vercel. Set all env vars above in the Vercel project settings (values from `.env` are not synced automatically). Steam login and the Clerk webhook both require the deployed HTTPS origin to be reachable.
- Set `ADMIN_STEAM_IDS` to your SteamID64 so your account becomes `admin` on login and can open the Admin Panel.
- **Game server**: deploy separately (Vercel cannot run always-on WebSocket processes) -- see [`server/README.md`](./server/README.md) for step-by-step instructions for Koyeb (free), Fly.io, and Railway.
