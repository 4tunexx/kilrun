# Kilrun audit — modes, Premium, ranks, matchmaking

_Last updated: 2026-07-22 (branch `cursor/home-daily-missions-count-200f`)_

## Merge

- Current work: [PR #36](https://github.com/4tunexx/kilrun/pull/36) (`cursor/home-daily-missions-count-200f`) — daily mission count fix + security/progression audit hardening + server-authored match rewards.

## After deploy (required once)

Full checklist with env vars also lives in the root [`README.md`](../README.md).

1. Admin → **Dashboard → Sync database schema** (`2026-07-22-party-seasons`)
2. Admin → **Dashboard → Load built-in Kilrun defaults** (seed progression)
3. **Restart Colyseus** — Admin → Dashboard → **Restart Colyseus** (or redeploy the game server). Requires `GAME_SERVER_ADMIN_SECRET` on both web + game server.
4. Map Editor: set **Active** map for Deathrun / Horde / Competitive
5. Game server: set `WEB_APP_URL` + matching secrets so match rewards POST back to the hub

---

## What is live (behind this PR)

### Modes
| Mode | Status | Notes |
|------|--------|--------|
| **Deathrun** | Live | Room `deathrun`, map editor mode, Active map push |
| **Horde** | Live | Room `horde`, waves, missions/badges seeded |
| **Competitive Casual** | Live | Room `competitive`, XP/KD/achievements, **no KP** |
| **Competitive Ranked** | Live | Room `competitive_ranked`, Premium (or free week), **KP Elo** |

### Premium
- Page + hub nav, **5000 VP / 30d** (admin-editable) or **$2.99/mo** request (Stripe deferred)
- Gem badge next to Steam/email; hub shows **Go Premium** when inactive
- Admin → **Premium**: prices, offers, free Ranked week
- Peak KP / peak rank kept forever on **public profile**

### Ranks
- Admin → **Ranks**: edit tier **name**, **min KP**, **image**, color
- Matchmaking wait + min same-rank players
- Ranked MM: prefer **same KP tier**; if not enough players after wait → **open lobby** (all ranks)
- Leaderboard / hub / profile use `RankBadge` / `RankLabel` from admin config

### Progression
- Missions / achievements / badges for Deathrun + Horde + Competitive (seed)
- Map Editor (3 modes) + Model Editor skins (`equippedSkins` verified in sync)
- **Match rewards** are server-authored: Colyseus POSTs to `/api/game/match-result` (shared `GAME_SERVER_ADMIN_SECRET`)
- **Join tokens**: hub-minted HMAC verified in Colyseus `onAuth`

### Leaderboard
- Tabs: Top XP · VP · Combat · **Ranked** (Premium by KP)

---

## What’s left / not fully behind yet

| Item | Status | Explanation |
|------|--------|-------------|
| **Stripe $2.99 checkout** | Deferred | Placeholder support-ticket flow; VP Premium path is real |
| **Deep anti-cheat** | Deferred | Pulsar + Premium Ranked gate only for now |
| **Party / party queue** | Done | Faceit-style party panel + shared room follow; Horde waits for 4 |
| **Dedicated Ranked season resets** | Done | Admin → Ranks: season config + End season (keeps peak KP/rank) |
| **Horde monster AI polish** | Improved | Separation + attack-range stop; further polish iterative |
| **Mobile Ranked UX** | Works via hub | Same queues; touch controls shared with Deathrun |

---

## Admin map (where to click)

- **Dashboard** — schema sync (`2026-07-22-match-rewards-audit`), seed/import, Colyseus restart, game/chat toggles  
- **Site** — logos, hero, hub layout  
- **Users / Moderation / Audit / Awards** — player ops (VP mint = admin-only; mods can’t ban staff)  
- **Missions / Achievements / Badges** — edit seeded definitions  
- **Support** — tickets  
- **Shop / Cosmetics** — catalog + Model Editor skins  
- **Premium** — VP/$ prices, offers, free Ranked week  
- **Ranks** — KP thresholds, badge images, MM wait / min players  
- **Map Editor** — Deathrun / Horde / Competitive maps + Active per mode  
- **Content** — news / guides  

---

## Technical notes

- Schema fields to sync: `User.kp`, `peakKp`, `peakRank`, `premiumExpiresAt`, `MatchResult.kpDelta`/`stats`, `SiteSettings.premiumConfigJson`, `rankConfigJson`, `equippedSkins`
- Ranked join options: `rankKey`, `mmWaitSec`, `minSameRankPlayers`, `isPremium` / `rankedAccess`
- Match rewards: set `WEB_APP_URL` (or `CLIENT_ORIGIN`) on Colyseus + matching `GAME_SERVER_ADMIN_SECRET` on web
- Join tokens: `GAME_JOIN_TOKEN_SECRET` (or admin secret) on web + game server
