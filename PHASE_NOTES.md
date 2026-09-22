# Phase 0 — CI + baseline

## Changed
- `.github/workflows/ci.yml` (new): web / game-server / audit jobs.
- `server/.eslintrc.json` (new) + `npm run lint:server`: the authoritative game server was never linted.
- `server/src/rooms/CompetitiveRoom.ts`: wrapped `case 'lobby'` in a block (`no-case-declarations`,
  `const minToStart` leaked into sibling cases). 3-line diff, behaviour identical, CRLF preserved.
- `docs/CI.md` (new).

## Baseline (measured)
| Check | Result |
|-------|--------|
| Game server `tsc --noEmit` | 0 errors |
| Game server ESLint | 0 errors, 18 warnings (12 `no-explicit-any`, 6 `no-unused-vars`) |
| Web `vitest run` | 496 tests passed; 2 suites failed to load |
| Web `tsc --noEmit` | NOT MEASURED in the authoring sandbox (Prisma engine download blocked) |

The 2 failing suites (`game-map-core.test.ts`, `match-rewards-claim.test.ts`) fail at import because
`src/generated/prisma` is not generated. CI runs `prisma generate` first, so they should load there.
Please confirm on the first CI run.

## Not changed on purpose
- `next.config.ts` `eslint.ignoreDuringBuilds` stays `true`.
- No dependency upgrades.

## Found but not fixed
- `scripts`: root `postinstall` runs `prisma generate`, so `npm ci --ignore-scripts` in the
  game-server job intentionally skips it (server lint only needs ESLint plugins).
- 6 source files use CRLF line endings and there is no `.gitattributes`. Consider adding one.

---

# Phase 1 — VIP monthly expiry (complete)

Fixes: a user whose VIP had "finished long ago" still showed the crown/orange name/cosmetics,
because `isVip` was permanent by design and nothing ever cleared it.

## Root cause
`isVip` (boolean) and `role === 'vip'` had no expiry mechanism. Only Kilrun Premium
(`premiumExpiresAt`, a separate product) expired. VIP purchase was a one-time 2,500 VP unlock with
no duration and no Purchase record.

## Decision applied (per user instruction)
VIP is now a **monthly subscription** (30 days, 2,500 VP default, admin-editable). Existing
permanent VIPs (`isVip=true`, `vipExpiresAt=null`) are preserved as-is until the operator runs the
grandfather migration script — nothing here silently converts them.

## What changed
- **Schema**: `User.vipExpiresAt` (null = permanent), `SiteSettings.vipConfigJson`.
- **Single source of truth**: `src/lib/vip.ts` — `isVipActive()`, `planVipPurchase()`,
  `withActiveVip()`, `activeVipWhere()`. Every perk-gating read site now derives `isVip` from
  expiry rather than trusting the raw boolean (leaderboard, friends, messages, forum, profile,
  landing, carousel, admin dashboard count, hub page load, `getCurrentUserProfile`).
- **Purchase/renewal**: `purchaseVipWithVp()` — config-driven price/duration, compare-and-set on
  balance AND current expiry (prevents double-charge on rapid double-clicks), stacks renewals,
  never charges permanent VIP, never touches admin/moderator roles, now writes a `Purchase` row
  (previously it wrote none). `unlockVipWithVp` kept as a deprecated wrapper for compatibility.
- **Cosmetics**: `grantVipCosmetics` gained a renewal mode that only fills *empty* slots, so a
  cosmetic the user equipped after VIP lapsed is never silently overwritten.
- **Expiry cron**: `/api/cron/expire-vip` (daily via `vercel.json`), fail-closed on missing
  `CRON_SECRET`, guarded against expiring a VIP that was renewed after the candidate list was
  loaded, unequips (but keeps) VIP cosmetics, sends 3-day/1-day/expired notifications
  deduplicated by `(user, expiry, stage)`.
- **System audit**: `src/lib/system-audit.ts` (deliberately no `'use server'` — would otherwise
  be a public endpoint) for cron/script/failed-purchase logging. The old code called the
  staff-only `writeAuditLog` from a player purchase, which always throws for a non-staff session
  and was being silently swallowed with `.catch(() => {})`.
- **Admin tools**: `adminSetUserRole` accepts an optional VIP expiry; new `adminSetVipExpiry()`;
  new "VIP" admin tab (`AdminVipPanel`, mirrors the Premium panel) for price/duration/offers;
  admin user detail sheet shows active/permanent/expired state and lets an admin set/clear the
  expiry date inline (hidden for admin/moderator targets).
- **Scripts** (both verified safe without a live database — see below):
  - `scripts/diagnose-vip.ts` — read-only CSV report, flags `EXPIRED_STILL_FLAGGED` and role/flag
    drift.
  - `scripts/grandfather-vip.ts` — dry-run by default; `--apply` also requires
    `CONFIRM_GRANDFATHER=yes`; never touches admin/moderator, already-timed VIPs, or
    `--exclude-file` ids; idempotent.
- **`admin-db-sync.ts`**: verify blocks for the two new fields, `DB_SCHEMA_SYNC_VERSION` bumped to
  `2026-09-22-vip-monthly-expiry` — **run "Sync database schema" after deploying this.**

## Testing
- 74 new unit tests across `vip.test.ts`, `vip-config.test.ts`, `vip-expiry.test.ts`,
  `vip-grandfather.test.ts`, `cron-auth.test.ts` — all pure functions, no database needed.
  Deliberately covers: expiry at the exact instant, unparseable dates (fails closed, never grants
  perks or demotes on corrupt data), admin/moderator are never demoted or auto-VIP'd, renewal
  stacking vs. restart-from-now, idempotent re-runs.
- Full suite: 564/564 passing (up from the Phase-0 baseline of 496).
- The two `grandfather-vip.ts` / `diagnose-vip.ts` scripts were run against a stub that throws if a
  Prisma client is ever constructed, to confirm `--help` and the refusal paths (`--apply` without
  confirmation, bad `--grace-days`) never touch a database. Both exit correctly (2 on refusal).

## Verified without a live Prisma client
This sandbox cannot generate the Prisma client (its engine download is blocked — see Phase 0
notes). Every change was checked by diffing `tsc --noEmit` output against the Phase-0 baseline
line-by-line; the 11 new error *signatures* all resolve to the same one root cause (no generated
client → several values type as `any`), which already existed at baseline in the same functions
before any Phase-1 edit touched them. `withActiveVip`'s generic signature was additionally proven
in isolation with a hand-written Prisma-shaped type in a throwaway tsconfig.
**Please run `npm run typecheck` for real once `prisma generate` succeeds in your environment**,
and treat this as unconfirmed until it comes back clean.

## Operator checklist before going live
1. Run `scripts/diagnose-vip.ts`, review the CSV — decide who (if anyone) should be permanently
   excluded from the grandfather migration (staff already excluded automatically; giveaway
   winners/partners are not, unless listed in an `--exclude-file`).
2. Run `scripts/grandfather-vip.ts` (dry run), review the table.
3. Run it again with `--apply` and `CONFIRM_GRANDFATHER=yes`.
4. Deploy. Run Admin → Dashboard → "Sync database schema".
5. Set `CRON_SECRET` in the hosting environment; confirm `vercel.json`'s cron is registered.
6. Consider announcing the change — a permanent perk becoming a monthly subscription, even with
   grace period + notifications, is a big change for existing VIPs.

## Not done in this phase (out of scope)
- Auto-renewal / card billing for VIP (deliberately deferred, per the original phase plan).
- Bundling VIP + Premium into a single purchase.
