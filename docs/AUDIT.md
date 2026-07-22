# Kilrun audit — modes, Premium, ranks, matchmaking

_Last updated: 2026-07-22 (branch `cursor/home-daily-missions-count-200f`)_

## Merge

- Current work: [PR #36](https://github.com/4tunexx/kilrun/pull/36) (`cursor/home-daily-missions-count-200f`) — daily mission count fix + security/progression audit hardening + server-authored match rewards.

## After deploy (required once)

1. Admin → **Dashboard → Sync database schema** (`2026-07-22-match-rewards-audit`)
2. Admin → **Dashboard → Seed progression** (Horde / Competitive missions, achievements, badges)
3. **Restart Colyseus** — Admin → Dashboard → **Restart Colyseus** (or redeploy the game server). Requires `GAME_SERVER_ADMIN_SECRET` on both web + game server.
4. Map Editor: set **Active** map for Deathrun / Horde / Competitive

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
- Page + hub nav, **5000 VP / 30d** (admin-editable) or **$2.99/mo** request
- Gem badge next to Steam/email; hub shows **Go Premium** when inactive
- Admin → **Premium**: prices, offers, free Ranked week
- Peak KP / peak rank kept forever on **public profile**

### Ranks (new)
- Admin → **Ranks**: edit tier **name**, **min KP**, **image**, color
- Matchmaking wait + min same-rank players
- Ranked MM: prefer **same KP tier**; if not enough players after wait → **open lobby** (all ranks)

### Progression
- Missions / achievements / badges for Deathrun + Horde + Competitive (seed)
- Map Editor (3 modes) + Model Editor skins (`equippedSkins` verified in sync)
- **Match rewards** are server-authored: Colyseus POSTs to `/api/game/match-result` (shared `GAME_SERVER_ADMIN_SECRET`)

### Leaderboard
- Tabs: Top XP · VP · Combat · **Ranked** (Premium by KP)

---

## What’s left / not fully behind yet

| Item | Status | Explanation |
|------|--------|-------------|
| **Stripe $2.99 checkout** | Placeholder | Card button creates support ticket + notification; VP path is real |
| **Deep anti-cheat** | Light | Client Pulsar activate (hub pulsar + “Anticheat Online”); Ranked = Premium-only (or free week); no replay/VAC-style system yet |
| **Colyseus restart** | Yes | Admin Dashboard → Restart Colyseus (`POST /admin/restart` + `GAME_SERVER_ADMIN_SECRET`) |
| **Party / party queue** | Not built | Solo joinOrCreate only |
| **Dedicated Ranked season resets** | Not built | Peak ranks persist; no soft reset seasons |
| **Rank images on every surface** | Done (hub + leaderboard + profile) | `RankLabel` / `RankBadge` use admin rank config images/colors |
| **Server-authoritative match awards** | Done | Colyseus → `/api/game/match-result`; client result screens are display/fallback |
| **Horde monster AI polish** | Basic | Playable waves; balance / bosses can iterate |
| **Mobile Ranked UX** | Works via hub | Same queues; touch controls shared with Deathrun |

---

## Admin map (where to click)

- **Dashboard** — schema sync, seed progression, service toggles  
- **Premium** — VP/$ prices, offers, free Ranked week  
- **Ranks** — KP thresholds, badge images, MM wait / min players  
- **Missions / Achievements / Badges** — edit seeded definitions  
- **Map Editor** — Deathrun / Horde / Competitive maps + Active per mode  
- **Shop / Cosmetics** — Model Editor skins, VIP cosmetics  

---

## Technical notes

- Schema fields to sync: `User.kp`, `peakKp`, `peakRank`, `premiumExpiresAt`, `MatchResult.kpDelta`/`stats`, `SiteSettings.premiumConfigJson`, `rankConfigJson`, `equippedSkins`
- Ranked join options: `rankKey`, `mmWaitSec`, `minSameRankPlayers`, `isPremium` / `rankedAccess`
- Fullscreen lobby now passes `competitiveQueue` + Premium access (bugfix in this pass)
- Match rewards: set `WEB_APP_URL` (or `CLIENT_ORIGIN`) on Colyseus + matching `GAME_SERVER_ADMIN_SECRET` on web
