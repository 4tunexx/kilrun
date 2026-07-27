# Kilrun — In-Game Leveling System + Carousel Fix

This zip contains the FULL, final versions of every file that was changed
or added. Each file's path inside this zip matches its real path in your
repo (e.g. `src/lib/actions.ts` in this zip → `src/lib/actions.ts` in your
project root).

## What's in here

**New in-game leveling/power-upgrade system** (separate from the website
account level/XP — that was NOT touched):
- `shared/ability-progression.ts` — the 11 powers (Health, Speed, Jump,
  Energy, Invisibility, Punch, Fly, Hook, Berserk, Unlimited Ammo, Thunder),
  their levels/costs/effects, and the in-game XP curve.
- `prisma/schema.prisma` — adds `gameXp`, `gameSkillPoints`,
  `gameAbilities` fields to `User`.
- `src/lib/game-progression-actions.ts` — server actions to read progress
  and spend skill points.
- `src/lib/match-rewards.ts` — awards in-game XP when a match ends.
- `src/components/game/ui/game-menu.tsx` + `src/components/game/kilrun-engine.tsx`
  — in-game menu (press **M**), level ring, skill points, "+" upgrade
  buttons, pulsing HUD indicator.
- `src/components/game-progression-card.tsx` +
  `src/components/views/profile-view.tsx` +
  `src/components/views/public-profile-view.tsx` — shows in-game level and
  powers on both your own and public profile pages.
- Server-side (Colyseus) gameplay wiring so Health/Speed/Jump/Energy/Punch
  Damage upgrades have REAL effect in matches:
  `server/src/sim/ability-stats.ts`, `server/src/sim/movement.ts`,
  `server/src/sim/weapon-combat.ts`, `server/src/trusted-loadout.ts`,
  `server/src/schema/RoomState.ts`, `server/src/rooms/DeathrunRoom.ts`,
  `server/src/rooms/HordeRoom.ts`, `server/src/rooms/CompetitiveRoom.ts`,
  `src/app/api/game/player-loadout/route.ts`.
  (Fly/Hook/Berserk/Bullet/Thunder have levels + effect values defined and
  upgradeable, but no in-match physics yet — that's a follow-up.)

## Bug fixes

- `src/components/game/entities/three-character.ts` — fixed the TS `never`
  narrowing compile error that was failing your Vercel build.
- `src/lib/actions.ts` — fixed the **Top Players / carousel bug**:
  `getLandingPageData()` ran 7 database queries in a single `Promise.all`
  with one silent outer `catch`. If ANY single query failed (most likely
  `purchase.groupBy`), the whole thing was thrown away — wiping out Top
  Players AND the Popular Items carousel together, even though most
  queries succeeded. Each query now fails independently with a safe
  fallback and a logged error.
- `src/app/landing/landing-page-client.tsx` — logs fetch failures instead
  of swallowing them silently.

## How to apply this

### Option A — GitHub Codespaces (works on phone, no git needed on your device)
1. Open `github.com/4tunexx/kilrun` → **Code** → **Codespaces** →
   **Create codespace on main**.
2. In the Codespace file explorer, create branch first in the terminal:
   ```bash
   git checkout -b feature/in-game-leveling-and-fixes
   ```
3. Upload every file from this zip into the Codespace, INTO THE SAME
   FOLDER PATHS shown above (e.g. drag `src/lib/actions.ts` from this zip
   onto the `src/lib` folder in the Codespace file tree, overwriting the
   existing file). Codespaces lets you drag-and-drop multiple files/folders
   at once from your device's file manager.
4. In the terminal:
   ```bash
   git add -A
   git commit -m "Add in-game leveling system + fix carousel bug"
   git push origin feature/in-game-leveling-and-fixes
   ```

### Option B — Your PC (fastest, since you've pushed from it before)
1. Extract this zip.
2. Copy its contents into your local `kilrun` repo folder, overwriting the
   matching files (same relative paths).
3. In PowerShell / terminal, from the repo root:
   ```bash
   git checkout -b feature/in-game-leveling-and-fixes
   git add -A
   git commit -m "Add in-game leveling system + fix carousel bug"
   git push origin feature/in-game-leveling-and-fixes
   ```

## After pushing

- Run `npx prisma generate` (or let your normal install/build step do it) —
  the new `User` fields need the Prisma client regenerated.
- Deploy the `server/` package too, not just Vercel — the gameplay stat
  wiring (Health/Speed/Jump/Energy/Punch) lives in the Colyseus game
  server, so a Vercel-only deploy won't pick it up.
- Open a PR from `feature/in-game-leveling-and-fixes` into `main` when
  you're ready to merge.
