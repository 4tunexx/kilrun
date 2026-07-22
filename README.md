# Kilrun

Kilrun is a real-time multiplayer arcade hub built on Next.js 15, with an authoritative Colyseus game server and a Three.js 3D client. Players sign in with Steam, optionally verify email for a welcome bonus, and play Deathrun, Horde, and Competitive (casual + ranked).

## Game modes

| Mode | Status | Description |
| --- | --- | --- |
| **Deathrun** | Live | 1 random **Trapper** controls traps; **Runners** race the course. |
| **Horde** | Live | Co-op wave survival against AI monsters. |
| **Competitive Casual** | Live | Team elimination — XP/VP, no KP. |
| **Competitive Ranked** | Live | Premium (or free Ranked week) — KP Elo ladder. |

## Tech stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, ShadCN UI
- **Auth**: Steam OpenID 2.0 + NextAuth.js v5 (primary), Clerk (email OTP verification)
- **Database**: MongoDB Atlas via Prisma ORM (`db push` — no SQL migration history)
- **Realtime game server**: [Colyseus](https://colyseus.io/) — see [`server/README.md`](./server/README.md)
- **Game rendering**: Three.js world + map/model editors (Pixi isometric path removed)

## Project structure

```
src/
  app/                        # Next.js routes + API
    api/auth/steam/           # Steam OpenID login + callback
    api/webhooks/clerk/       # Email verification webhook
    api/game/match-result/    # Colyseus → hub server-authored rewards
  components/
    game/                     # Engine, net, Three.js renderer, modes, editors
    views/                    # Hub screens + admin panels
  lib/                        # Server actions, progression, prisma, join tokens
prisma/
  schema.prisma               # MongoDB models
server/                       # Separate Colyseus deployable
docs/
  AUDIT.md                    # Modes / Premium / ranks / deploy checklist
  MODEL_EDITOR_AND_SKINS.md
  MAP_EDITOR_AND_PHYSICS_AUDIT.md
```

## Getting started

1. Copy `.env.example` → `.env` and fill values (MongoDB, Steam, Clerk, secrets).
2. Install and push schema:

   ```bash
   npm install
   npm run db:push
   npm run db:seed   # optional local seed
   ```

3. Hub:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

4. Game server (second terminal):

   ```bash
   cd server && npm install && npm run dev
   ```

   See [`server/README.md`](./server/README.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js (Turbopack) |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) — **preferred CI gate** |
| `npm run lint` | ESLint via `next lint` |
| `npm test` | Vitest unit tests |
| `npm run db:push` | Push Prisma schema to MongoDB |
| `npm run db:seed` | Seed progression catalogs locally |

## Environment variables

See `.env.example` for the full commented list.

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Web | MongoDB Atlas (use `maxPoolSize=1` on Vercel) |
| `AUTH_SECRET` | Web | NextAuth session signing |
| `STEAM_API_KEY` | Web | Profile username/avatar after Steam login |
| `NEXT_PUBLIC_SITE_URL` | Web | Canonical site origin (emails, embeds) |
| `NEXT_PUBLIC_CLERK_*` / `CLERK_*` | Web | Email OTP verification |
| `NEXT_PUBLIC_GAME_SERVER_URL` | Web | `ws://` / `wss://` Colyseus URL (build-time) |
| `GAME_SERVER_ADMIN_SECRET` | **Web + game** | Restart Colyseus + authorize match-result POSTs |
| `GAME_JOIN_TOKEN_SECRET` | **Web + game** | HMAC join tokens (falls back to admin secret) |
| `WEB_APP_URL` | **Game** | HTTPS origin of Next.js so Colyseus can POST `/api/game/match-result` |
| `CLIENT_ORIGIN` | Game | CORS + fallback for `WEB_APP_URL` |
| `ADMIN_STEAM_IDS` | Web | Extra SteamID64s promoted to admin (owner `76561198001993310` is always admin in code) |

> **Steam auth on Vercel**: login/callback derive origin + secure cookies from the request (`req.nextUrl`), not from `NEXTAUTH_URL`.

> **MongoDB Atlas**: Network Access must allow `0.0.0.0/0` for Vercel; cluster must not be paused; set `DATABASE_URL` with `maxPoolSize=1`.

---

## Admin panel (post-deploy checklist)

Admins open the hub → **Admin**. Owner Steam ID is always promoted on login; add others via `ADMIN_STEAM_IDS`.

### After every schema / progression deploy

1. **Admin → Dashboard → Sync database schema**  
   - Runs `prisma db push` when the CLI is available, then verifies writable fields (KP, peak ranks, Premium, rank config, MatchResult, `equippedSkins`, etc.).  
   - Expected version constant: `2026-07-22-party-seasons` (see `src/lib/admin-db-sync.ts`).  
   - Dashboard shows **up to date** / **needs sync**. Safe on Mongo — does not wipe players.  
   - If cloud map publish fails with missing `GameMap`, run this sync first.  
   - Sync also creates the `Party` collection (invite-code squad queue).

2. **Admin → Dashboard → Load built-in Kilrun defaults** (Seed progression)  
   - Upserts mission / achievement / badge / shop catalog seeds. Does **not** delete player data.  
   - Also supports **Upload SQL / JSON seed** for custom catalogs.

3. **Admin → Dashboard → Restart Colyseus**  
   - Soft-restarts the game server (`POST /admin/restart`).  
   - Requires `GAME_SERVER_ADMIN_SECRET` on **both** web and game server, plus `NEXT_PUBLIC_GAME_SERVER_URL`.

4. **Admin → Map Editor**  
   - Set an **Active** map for Deathrun / Horde / Competitive after deploy.

### Matchmaking notes

- **Horde** waits for **4 players** before auto-start. Admins can **Launch now** from the lobby with 1+ players.
- **Party** (Play view): invite **Steam friends** (needs public Steam friends list + `STEAM_API_KEY`) and hub friends, or share a 6-char code. Leader queues; members follow into the same room. Notifications have **Accept** for party invites.
- **Ranked seasons** (Admin → Ranks): set season name / dates / KP reset; **End season & reset KP** keeps peak KP/rank and bumps `seasonId`.

### Admin tabs (what each is for)

| Tab | Who | What |
| --- | --- | --- |
| **Dashboard** | Admin | Schema sync, seed/import, Colyseus restart, service toggles (game/chat), audit snapshot |
| **Site** | Admin | Logos, hero, background, hub layout / nav / chrome |
| **Users** | Staff | Lookup players, adjust VP (**admin only**), inspect inventory |
| **Moderation** | Staff | Ban / mute (mods cannot ban/mute other staff; admins can) |
| **Audit** | Staff | Staff action log |
| **Awards** | Admin | Award XP / VP / badges |
| **Missions / Achievements / Badges** | Staff | Edit definitions |
| **Support** | Staff | Tickets |
| **Shop** | Staff | Catalog, fire sales, cosmetics |
| **Premium** | Admin | VP/$ prices, offers, free Ranked week |
| **Ranks** | Admin | KP tiers, badge images, matchmaking wait / min same-rank, **ranked seasons** |
| **Map Editor** | Admin | Per-mode maps + Active publish (needs schema sync) |
| **Content** | Staff | News / guides |

### Local vs production schema

| Environment | How to sync |
| --- | --- |
| Local | `npm run db:push` (and optional `npm run db:seed`) |
| Production (Vercel) | Prefer **Admin → Sync database schema** (no laptop CLI required). Field verify still runs if Prisma CLI is missing on serverless. |

---

## Match rewards & join security

- **Join**: hub mints a short-lived HMAC token (`mintMyGameJoinToken`); Colyseus `onAuth` verifies admin / Premium / KP claims when a join secret is configured.
- **Rewards**: when a match ends, Colyseus POSTs to `${WEB_APP_URL}/api/game/match-result` with `GAME_SERVER_ADMIN_SECRET`. Results UI prefers room `xpEarned` / `vpEarned`; client `record*` is a local/dev fallback only.
- Set on the **game server**: `WEB_APP_URL=https://your-app.vercel.app` and the same `GAME_SERVER_ADMIN_SECRET` as Vercel.

## Deployment

- **Production branch**: `main` → `https://kilrun.vercel.app/`
- **Web**: Vercel — set all web env vars; redeploy after changing `NEXT_PUBLIC_*`
- **Game server**: always-on host (Koyeb / Fly / Railway) — see [`server/README.md`](./server/README.md)
- After merge: run Admin **Sync database schema** + **Seed defaults** + **Restart Colyseus** + set Active maps

## Further docs

- [`docs/AUDIT.md`](./docs/AUDIT.md) — modes, Premium, ranks, remaining product gaps (Stripe / anticheat deferred)
- [`docs/MODEL_EDITOR_AND_SKINS.md`](./docs/MODEL_EDITOR_AND_SKINS.md)
- [`docs/MAP_EDITOR_AND_PHYSICS_AUDIT.md`](./docs/MAP_EDITOR_AND_PHYSICS_AUDIT.md)
- [`server/README.md`](./server/README.md)
