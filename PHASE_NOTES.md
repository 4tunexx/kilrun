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
