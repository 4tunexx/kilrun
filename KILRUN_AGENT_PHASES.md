# KILRUN — Coding Agent Phase Prompts

Paste **one phase at a time** into your coding agent. Do not skip ahead: later phases assume earlier ones are merged. After each phase, run the **Gate** commands yourself before starting the next.

**Order and why**

| # | Phase | Risk | Why here |
|---|-------|------|----------|
| 0 | Safety net: CI + baseline | Low | Nothing else is verifiable without it |
| 1 | VIP expiry bug (the reported user issue) | Medium | Your live bug; touches ~93 read sites |
| 2 | Money-path integrity (VP, refunds, audit) | High | Players lose currency silently today |
| 3 | Dependency security upgrades | Medium | 3 critical, 6 high advisories |
| 4 | Auth and access hardening | Medium | dev-login, owner backdoor, rate limits |
| 5 | Game server audit (anti-cheat, desync) | High | Never linted, never reviewed |
| 6 | Refactor giant files | Medium | Maintainability, do last so diffs stay clean |
| 7 | Schema and ops hygiene | Low | Migrations trail, monitoring, docs |

## Global rules (paste at the top of EVERY phase)

```
GLOBAL RULES FOR THIS TASK
- Repo: Kilrun (Next.js 15 App Router, React 19, Prisma 6.19 on MongoDB, NextAuth v5 + Steam OpenID,
  Clerk email OTP, Colyseus game server in /server, Tauri desktop engine in /desktop).
- Work on a NEW branch named exactly as given in the phase. Never commit to main.
- Make small, reviewable commits (one logical change each) with clear messages.
- Do NOT change anything outside the phase scope. If you find an unrelated bug, list it in
  PHASE_NOTES.md under "Found but not fixed" and move on.
- Do NOT delete or rewrite existing tests to make them pass. Fix the code, or explain why the test is wrong.
- Do NOT run `prisma db push` against any real database. Use a local/throwaway MongoDB only.
- Never print, log, or commit secrets. Never touch .env files other than .env.example.
- Before finishing, run: npm run typecheck && npm test && npm run lint. Report the exact output.
- If a requirement is ambiguous or a change could alter player-visible behavior or currency, STOP and
  ask instead of guessing.
- At the end, write PHASE_NOTES.md: what changed, files touched, how you verified, anything skipped and why.
```

---

# PHASE 0 — Safety net (CI + baseline)

**Branch:** `phase-0/ci-baseline`

```
GOAL
Create an objective safety net so every later change can be verified automatically. The repo currently
has NO CI (no .github/workflows).

CONTEXT
- Scripts in package.json: typecheck (tsc --noEmit), lint (next lint), test (vitest run).
- ESLint config ignores `server/**`, and next.config.ts has eslint.ignoreDuringBuilds = true, so lint
  never blocks anything and the game server is never linted.
- Prisma client is generated to src/generated/prisma (gitignored). Typecheck and two test suites
  (game-map-core.test.ts, match-rewards-claim.test.ts) fail if the client is not generated first.
- server/ is a separate package with its own package.json and `typecheck` script.

TASKS
1. Add .github/workflows/ci.yml, triggered on pull_request and on push to main, with jobs:
   a. web: Node 20, `npm ci`, `npx prisma generate` (set a dummy DATABASE_URL=mongodb://localhost:27017/ci),
      then `npm run typecheck`, `npm run lint`, `npm test`.
   b. game-server: `cd server && npm ci && npm run typecheck && npm run build`.
   c. audit: `npm audit --omit=dev --audit-level=high`. Set continue-on-error: true for now and add a
      comment that Phase 3 flips this to blocking.
   Cache npm. Use concurrency groups to cancel superseded runs.
2. Fix .eslintrc.json so the game server is linted: remove `server/**` from ignorePatterns. Add a small
   server/.eslintrc.json if needed (server has no next/core-web-vitals). Run lint on server/ and fix
   ONLY errors. Downgrade or configure noisy rules to "warn" rather than mass-editing server code.
3. Run the full pipeline locally, record the baseline (number of TS errors, lint errors/warnings,
   failing tests) in PHASE_NOTES.md. Fix any real typecheck/test failures that are not caused by the
   missing Prisma client.
4. Add a `docs/CI.md` (10 lines max): what CI runs and how to reproduce locally.

DO NOT
- Do not enable eslint in `next build` yet (ignoreDuringBuilds stays true until warnings are cleaned).
- Do not upgrade any dependency in this phase.
- Do not refactor application code.

ACCEPTANCE CRITERIA
- Opening a PR triggers CI and all required jobs pass on a clean checkout.
- `server/` is linted and typechecked in CI.
- PHASE_NOTES.md contains the baseline numbers.

GATE (I run these)
npm ci && npx prisma generate && npm run typecheck && npm run lint && npm test
cd server && npm ci && npm run typecheck && npm run build
```

---

PHASE 1: Monthly VIP subscription (VIP must expire)
Branch: phase-1/vip-monthly-expiry

GOAL
Platform VIP becomes a TIMED MONTHLY membership. Users whose VIP has ended must immediately stop
showing the crown, orange name and VIP cosmetics, and must be able to renew. A specific user's VIP
ended long ago but still shows a crown, because today VIP is permanent by design and nothing ever
clears it.

CONTEXT (verified in code)
- prisma/schema.prisma User has isVip Boolean, role String (player|vip|moderator|admin),
  premiumExpiresAt DateTime? (Kilrun Premium = a DIFFERENT product; do not touch or merge it).
- src/lib/vip.ts exports only VIP_UNLOCK_VP_COST = 2500 and calls VIP "permanent".
- src/lib/social-actions.ts:
  - unlockVipWithVp() (~L334): atomic guarded debit, sets isVip:true and role:'vip' (only if role
    was 'player'), then grantVipCosmetics() (creates/equips vip-crown-frame, vip-banner,
    vip-nickname and writes denormalized equippedFrame*/equippedBanner*/equippedNickname* on User),
    then a notification and processWebsiteAction(user.id,'vip').
    It writes NO Purchase row, so there is no record of when anyone bought VIP.
  - adminSetUserRole() (~L2141): role 'vip' sets isVip:true; 'player' sets isVip:false. No date.
  - purchasePremiumWithVp(offerId?) (~L400): THE PATTERN TO MIRROR: config-driven price/duration,
    stacks from the current expiry if still active, notification, returns fresh balance.
- src/lib/premium-config.ts: PremiumConfig {vpCost, durationDays, offers[]} parsed from
  SiteSettings.premiumConfigJson via parsePremiumConfig()/serializePremiumConfig(), edited in
  src/components/views/admin/admin-premium-panel.tsx.
- UI: src/components/game-hub-interface.tsx ~L659-1070 has the VIP unlock button/dialog and calls
  unlockVipWithVp(); it shows "Spend {VIP_UNLOCK_VP_COST} VP" and "Unlock for N VP".
- Rendering: src/components/ui/player-avatar.tsx (crown on isVip), src/lib/role-colors.ts (orange on
  role==='vip' || isVip), leaderboard-view.tsx (crown on row.isVip). None check any date.
- ~93 read sites of isVip in src/ and server/ (grep -rn "isVip" src server --include=*.ts --include=*.tsx).
- announcement-carousel-actions.ts L198 and admin-dashboard.ts L123 query `where: { isVip: true }`.
- src/lib/audit.ts writeAuditLog() REQUIRES a staff session, so it throws for player/cron flows;
  unlockVipWithVp currently swallows that with .catch(() => {}).
- Notification model has dedupeKey String? (idempotency); use it.

DECISIONS ALREADY MADE (do not re-ask)
1. Existing permanent VIPs are GRANDFATHERED with a grace period: set vipExpiresAt = now + 30 days
   through a dry-run-first script, and notify them.
2. Price/duration are admin-editable via a new SiteSettings.vipConfigJson mirroring premiumConfigJson.
   Defaults: 2500 VP, 30 days, one enabled offer id "vip_month_vp".
3. Renewal is MANUAL and STACKS on remaining time. NO auto-charge in this phase.
4. On expiry: VIP cosmetics are unequipped but KEPT in inventory; renewal re-equips them.
5. Warnings via Notification at 3 days and 1 day before expiry, and one on expiry (use dedupeKey).
6. Admin-granted VIP takes an explicit expiry date, or null meaning "permanent" (staff/giveaways).
   Semantics everywhere: isVip=true with vipExpiresAt=null means PERMANENT; a date means timed.

TASKS
1. DIAGNOSE FIRST (read-only). Create scripts/diagnose-vip.ts (tsx, DATABASE_URL from env, --help)
   that outputs CSV of every user with isVip=true OR role='vip': id, username, steamId, isVip, role,
   premiumExpiresAt, createdAt, ownsVipCrownFrame (InventoryItem itemSku 'vip-crown-frame'),
   isVipEquipped. Include a summary count of rows where isVip=true but role!='vip' and the reverse
   (drift between the two fields). Never writes.

2. SCHEMA. Add to User: `vipExpiresAt DateTime?` with a doc comment defining the semantics above.
   Add to SiteSettings: `vipConfigJson String @default("{}")`. Add both to the runtime verification
   in src/lib/admin-db-sync.ts (follow the premiumExpiresAt / premiumConfigJson pattern) and bump its
   version constant. Mention in the README post-deploy note that Sync schema must be run.

3. CONFIG. Create src/lib/vip-config.ts modeled on premium-config.ts: VipConfig
   {vpCost, durationDays, offers[]}, DEFAULT_VIP_CONFIG (2500/30/one offer), parseVipConfig(),
   serializeVipConfig() with the same defensive number/offer parsing. Add tests
   (src/lib/vip-config.test.ts): garbage JSON, missing fields, negative numbers, disabled offers.
   Add a "VIP" section to the admin panel next to Premium (reuse admin-premium-panel patterns)
   to edit price/duration/offers; admin-only.

4. SINGLE SOURCE OF TRUTH in src/lib/vip.ts:
   - `isVipActive(u: {isVip?: boolean|null; role?: string|null; vipExpiresAt?: Date|string|null}, now = Date.now())`
     Active iff (isVip === true || role === 'vip') AND (vipExpiresAt is null/undefined OR
     vipExpiresAt > now). Invalid date strings => NOT active. admin/moderator roles alone are NOT vip.
   - `vipMsRemaining()`, `addVipDays(from, days)` (stack from current expiry if still in the future,
     mirror addPremiumDays), `formatVipCountdown()` (reuse the format style of
     formatPremiumCountdown).
   - Keep VIP_UNLOCK_VP_COST exported as @deprecated alias of DEFAULT_VIP_CONFIG.vpCost so existing
     imports (roles.ts, game-hub-interface.tsx) do not break; migrate call sites to config.
   Unit tests (src/lib/vip.test.ts): null expiry (permanent), future, past, exactly-now, invalid
   string, role=vip without isVip, isVip without role, admin, stacking from active vs expired.

5. REPLACE ALL PERK-GATING READS. Route every place that decides crown / orange name / VIP cosmetics /
   badges / carousel / dashboard / game join claims through isVipActive(). Rules:
   - Every Prisma `select` that feeds those reads must also select vipExpiresAt (and role).
   - Do NOT rename the outward `isVip` field in API/props shapes. Compute `isVip: isVipActive(row)`
     where each shape is built, so components remain untouched.
   - Queries: announcement-carousel-actions.ts and admin-dashboard.ts must add
     `OR: [{vipExpiresAt: null}, {vipExpiresAt: {gt: new Date()}}]` alongside isVip:true.
   - Do it in small commits by area (hub UI, profile, leaderboard, social, join token, game server)
     and list any intentional non-gated reads in PHASE_NOTES.md.
   - Server: if server/ reads VIP from join-token claims, compute it with isVipActive at token
     issue (src/lib/game-join-token.ts) so an expired VIP never gets the claim.

6. PURCHASE / RENEWAL. Replace unlockVipWithVp with `purchaseVipWithVp(offerId?)` (keep
   `unlockVipWithVp` as a thin wrapper calling it so existing imports keep compiling):
   - Read config via getSiteSettings + parseVipConfig, like purchasePremiumWithVp.
   - Compute nextExpires = addVipDays(current expiry if still active else now, durationDays).
     If the user is currently PERMANENT (isVip && vipExpiresAt==null) return {ok:true, already:true,
     permanent:true} and do NOT charge.
   - Keep the atomic guard `updateMany where vpCurrency gte cost`; in the SAME atomic update set
     isVip:true, vipExpiresAt: nextExpires, and role:'vip' only if role==='player'
     (never alter admin/moderator).
   - Create a Purchase row (itemSku 'vip-subscription', vpSpent) so there is finally a record.
   - grantVipCosmetics() stays idempotent; on RENEWAL it must re-equip VIP cosmetics that expiry
     unequipped (but never overwrite a different cosmetic the user equipped in that slot AFTER expiry:
     only re-equip a slot if it is currently empty or still points at the VIP item).
   - Notification "VIP active until <date>". Return fresh vpBalance and vipExpiresAt (ISO) like
     purchasePremiumWithVp so the client can update state.
   - On any failure after the debit, refund and surface the failure via the system audit log
     (task 9). Never swallow silently.

7. ADMIN. adminSetUserRole('vip'): keep isVip true, and set vipExpiresAt only if a date is supplied
   via a new optional parameter; default for role change to 'vip' with no date = permanent (null),
   matching decision 6. Demoting vip->player sets isVip=false AND vipExpiresAt=null. Add
   adminSetVipExpiry(userId, date|null) (admin-only, audited) and show "VIP until / Permanent" plus
   an expiry date input in admin-user-detail-sheet.tsx.

8. EXPIRY CRON. Create src/app/api/cron/expire-vip/route.ts (GET, runtime nodejs):
   - Requires header `Authorization: Bearer ${CRON_SECRET}` compared with timingSafeEqual.
     503 if CRON_SECRET unset (fail closed), 401 on mismatch.
   - Phase A (expire): users with isVip=true AND vipExpiresAt <= now: set isVip=false; set
     role='player' ONLY IF role==='vip' (never touch admin/moderator); unequip VIP cosmetics
     (InventoryItem itemSku in vip-crown-frame/vip-banner/vip-nickname with isEquipped=true) and clear
     the User denormalized equipped* snapshot fields ONLY IF they still reference those VIP items.
     Keep the items in inventory. Create an "VIP expired" Notification with dedupeKey
     `vip:expired:<userId>:<vipExpiresAt ISO>`.
   - Phase B (warn): users with vipExpiresAt within 3 days and within 1 day: Notification with
     dedupeKey `vip:warn3:<userId>:<expiresISO>` / `vip:warn1:...` (create-if-absent; tolerate the
     duplicate-key error).
   - Idempotent, batched (chunks of 100), safe to run repeatedly, returns
     {expired, warned3, warned1}. Even if the cron never runs, isVipActive() already hides perks.
   - Add vercel.json with a daily cron ("0 3 * * *" is fine) and CRON_SECRET to .env.example with a
     comment. If the project is not on Vercel Cron, document an equivalent trigger in the README.

9. AUDIT. Add `writeSystemAuditLog({action, targetUserId?, targetUsername?, detail?})` in
   src/lib/audit.ts (actor recorded as 'system', no staff session required, never throws to caller,
   but console.error on failure). Do NOT weaken the staff-only writeAuditLog. Use the system writer
   for: cron expiry summary, vip_cosmetic_grant_failed, vip refund failures, and admin grandfather
   script summaries.

10. UI.
    - game-hub-interface.tsx: replace the fixed "Unlock for {N} VP" with config-driven price; show
      state: Not VIP -> "Get VIP (30 days) for N VP"; Active timed -> "VIP until <date> (N days left)"
      with a "Renew +30 days" button (stacks); Permanent -> "Permanent VIP" (no purchase button).
    - Update the local state after purchase from the returned vipExpiresAt (mirror how
      premiumExpiresAt is handled at ~L751).
    - Profile/premium views: show the same status text. Keep changes small; no redesign.

11. GRANDFATHER SCRIPT (never auto-run). scripts/grandfather-vip.ts:
    - Default is --dry-run: prints a table of users who WOULD get vipExpiresAt = now + GRACE_DAYS
      (default 30, override with --grace-days), only rows with isVip=true AND vipExpiresAt==null AND
      role NOT in (admin, moderator). Also prints an --exclude-file option (CSV of userIds who must stay
      permanent: staff, giveaway winners, partners).
    - `--apply` additionally requires env CONFIRM_GRANDFATHER=yes and writes vipExpiresAt in chunks,
      creating one Notification per user ("Kilrun VIP is now a monthly membership. Your VIP runs until
      <date>. Renew any time to keep your perks.") with dedupeKey `vip:grandfather:<userId>`.
    - Prints a before/after summary. Idempotent (skips users who already have vipExpiresAt).

12. TESTS. Add tests for: purchaseVipWithVp (insufficient VP, first purchase, renewal stacks,
    permanent user not charged, admin role preserved, config price used), cron expiry logic extracted
    into a pure function `computeVipExpiryPlan(users, now)` (expire vs warn vs skip, admin never
    demoted, idempotent), grandfather selection logic, cosmetic re-equip rules, and the query
    filters. Follow the mocking style of src/lib/match-rewards-claim.test.ts.

DO NOT
- Do NOT touch Premium (isPremiumActive, premiumExpiresAt, purchasePremiumWithVp, premium config/UI).
- Do NOT run grandfather-vip.ts with --apply. I run it myself after reviewing the dry-run.
- Do NOT delete VIP inventory items or Purchase rows from anyone.
- Do NOT change the role of admin or moderator accounts on any path.
- Do NOT implement auto-renewal or card payments.
- Do NOT rename the outward `isVip` prop/field.

ACCEPTANCE CRITERIA
- A user with isVip=true and vipExpiresAt in the past shows NO crown, NO orange name, is excluded from
  the VIP dashboard count and the announcement carousel, and does not get a VIP join claim, even if
  the cron has never run.
- After the cron runs: isVip=false, role='player' (if it was 'vip'), VIP cosmetics unequipped but still
  owned, denormalized equipped* fields cleared only where they pointed at VIP items.
- Renewing while active extends from the current expiry; renewing after expiry starts from now and
  re-equips VIP cosmetics into empty slots.
- Permanent (vipExpiresAt=null) VIPs are unchanged and not charged on "purchase".
- Cron endpoint: 401 without secret, 503 when CRON_SECRET unset, idempotent on repeat.
- `grep -rn "\.isVip\b"` shows no remaining perk-gating read that bypasses isVipActive (exceptions
  listed in PHASE_NOTES.md).
- New notifications are created at most once per (user, expiry, stage).
- typecheck, lint and all tests pass.

GATE (I run these)
npm run typecheck && npm test && npm run lint
npx tsx scripts/diagnose-vip.ts > vip-report.csv        (send me the CSV)
npx tsx scripts/grandfather-vip.ts --dry-run             (send me the table)

---

# PHASE 2 — Money-path integrity (VP, refunds, audit)

**Branch:** `phase-2/vp-integrity`

```
GOAL
Guarantee a player can never permanently lose VP (Kilrun's currency) or receive an item without paying,
even when a write fails midway. Today VP is debited first and a failed follow-up write triggers a
best-effort refund that is wrapped in `catch { /* ignore */ }`, so a failed refund loses VP silently
with no trace.

CONTEXT (verified in code)
- Atomic debit pattern is correct and must be preserved:
  prisma.user.updateMany({ where: { id, vpCurrency: { gte: price } }, data: { vpCurrency: { decrement } } })
- Debit -> follow-up writes -> ignore-on-failure refund appear in:
  - src/lib/case-actions.ts: purchaseCrateFromShop (~L179-195), openCase vp_purchase path (~L540-565)
  - src/lib/social-actions.ts: store purchase (~L1301-1350), a second purchase flow (~L1396-1420),
    and the sale/refund flow near ~L1860
  - src/lib/social-actions.ts purchasePremiumWithVp (~L433) and unlockVipWithVp (~L349): the debit and
    the perk grant are separate writes
- Unguarded increments (fine for rewards, but verify each): match-rewards.ts L288/353/484,
  progression-actions.ts L1831, clerk webhook L221, email-link-actions.ts L53, case-actions L112/L406.
- The Clerk webhook and email-link-actions both grant +100 VP for email verification guarded by
  `alreadyVerified` read-then-write. Check this for a double-grant race.
- Prisma + MongoDB supports $transaction ONLY on a replica set (Atlas is one). Local standalone Mongo
  does not.

TASKS
1. Create src/lib/vp-ledger.ts with:
   - `spendVp(tx|prisma, userId, amount, reason, refId)`: atomic guarded debit, throws
     InsufficientVpError.
   - `grantVp(tx|prisma, userId, amount, reason, refId)`.
   - Both write a VpTransaction row (add model VpTransaction: id, userId, delta Int, reason String,
     refId String?, balanceAfter Int?, createdAt; index on userId+createdAt). This is an append-only
     ledger so support can reconstruct any balance.
2. Convert each purchase flow listed above to run debit + purchase record + item grant inside ONE
   `prisma.$transaction(async tx => {...})` so a failure rolls back the debit automatically.
   Remove the manual best-effort refund blocks. Where a transaction cannot be used (external side
   effects), keep the compensation but: (a) retry once, (b) on final failure write a
   `refund_failed` row to a new PendingRefund collection AND a system audit log entry, never swallow.
3. Add idempotency for the email-verification bonus: make the +100 VP grant a single atomic
   conditional update (`updateMany where emailVerified:false` then check count) shared by BOTH
   src/app/api/webhooks/clerk/route.ts and src/lib/email-link-actions.ts, so simultaneous calls grant
   once. Add a test simulating two concurrent calls.
4. Add an admin panel list view "Pending refunds" (read-only table + "mark resolved" button, admin
   only) fed by PendingRefund.
5. Write vitest tests with mocked Prisma for: insufficient funds, failure after debit rolls back,
   concurrent double-spend, double-verify bonus. Follow the style of src/lib/match-rewards-claim.test.ts.
6. Add a read-only reconciliation script scripts/reconcile-vp.ts: for N users compares
   sum(VpTransaction.delta) with the current balance and prints mismatches. (Historical data will not
   reconcile before the ledger existed; only report drift from the ledger start date.)

DO NOT
- Do not change any price, reward amount, or drop rate.
- Do not remove the atomic `gte` guard.
- Do not backfill historical ledger rows.
- Do not change match-reward claim logic beyond routing it through grantVp.

ACCEPTANCE CRITERIA
- No `catch { /* ignore */ }` remains on any money path (`grep -rn "ignore refund"`).
- Killing the process between debit and item grant (simulate by throwing in the test) leaves the
  balance unchanged.
- Every VP change writes exactly one VpTransaction.
- Tests pass, including the two concurrency tests.

GATE
npm run typecheck && npm test && npm run lint
Manually verify on a staging replica set: buy an item, then force a DB error and confirm rollback.
```

---

# PHASE 3 — Dependency security upgrades

**Branch:** `phase-3/deps-security`

```
GOAL
Eliminate the critical and high npm advisories in production dependencies without breaking the app.
`npm audit --omit=dev` currently reports 11 vulnerabilities (3 critical, 6 high, 1 moderate, 1 low).

FINDINGS
- CRITICAL next (direct): DoS in App Router Server Actions; SSRF in Server Actions on custom servers.
- CRITICAL next-auth / @auth/core: email normalizer validates before Unicode normalization
  (homoglyph "@" bypass). This app authenticates with Steam via a stub Credentials provider, so
  exploitability is likely low, but upgrade anyway.
- HIGH prisma / @prisma/config / deepmerge-ts (npm suggests a "major" fix that is actually a
  downgrade to 6.12: DO NOT apply --force blindly).
- HIGH postcss (direct), nanoid, sharp (libvips CVEs; sharp is a devDependency but also nested in next).
- MODERATE undici. LOW @simplewebauthn/server (v9 -> v14 is a major jump).

TASKS
1. Upgrade in this order, one commit each, running typecheck+tests+build between:
   a. `npm audit fix` (non-breaking only). Review the lockfile diff summary; do NOT use --force.
   b. next to the latest patched 15.5.x (stay on 15; do not jump to 16 in this phase).
   c. next-auth 5 beta to the newest 5.x beta that pulls a patched @auth/core.
   d. postcss and sharp to patched versions (override nested copies via package.json "overrides" if
      needed).
   e. Prisma: stay on the 6.19 line unless an advisory-free 6.x exists; evaluate 7.x in a SEPARATE
      write-up (docs/PRISMA_7_EVALUATION.md) listing breaking changes for MongoDB. Do not migrate.
   f. @simplewebauthn/browser+server: check whether WebAuthn is actually used
      (`grep -rn simplewebauthn src`). If unused, REMOVE both packages. If used, upgrade to v14 and fix
      call sites.
2. Also review the game server: run `npm audit --omit=dev` inside /server and fix likewise
   (colyseus 0.16.5 line, express 5.2.1).
3. Bump non-security minors safely with `npm update` for patch/minor only (radix, lucide, zod,
   date-fns). Skip majors (@clerk/nextjs 7, @hookform/resolvers 5): list them in
   docs/UPGRADE_BACKLOG.md with the breaking changes to expect.
4. Flip the CI audit job from continue-on-error to blocking at `--audit-level=high`.
5. Verify `npm run build` succeeds and smoke test: Steam login flow, hub load, one Colyseus room join.

DO NOT
- Do not run `npm audit fix --force`.
- Do not upgrade Next to 16, React to another major, Tailwind to 4, or Prisma to 7.
- Do not change application logic to work around a dependency bug without telling me.

ACCEPTANCE CRITERIA
- `npm audit --omit=dev --audit-level=high` exits 0 in root and in /server (or every remaining
  advisory is listed in docs/UPGRADE_BACKLOG.md with justification).
- typecheck, tests, lint, and `npm run build` all pass.
- A short changelog in PHASE_NOTES.md of every version moved.

GATE
npm ci && npm audit --omit=dev --audit-level=high && npm run typecheck && npm test && npm run build
```

---

# PHASE 4 — Auth and access hardening

**Branch:** `phase-4/auth-hardening`

```
GOAL
Remove standing risks in authentication/authorization and add abuse protection to sensitive endpoints.

FINDINGS (verified in code)
- src/app/api/auth/dev-login/route.ts mints a full ADMIN session for any steamId, gated only by
  `NODE_ENV === 'production'`. A staging/preview deploy with a different NODE_ENV would be an
  instant admin takeover.
- src/lib/roles.ts hardcodes OWNER_STEAM_IDS = ['76561198001993310'], permanently promoted to admin on
  every login. Documented in README but not configurable.
- Routes with no in-file auth (verify each is intentionally public): api/auth/steam, api/auth/nextauth,
  api/engine/catalog, api/engine/version, api/engine/download, api/game/active-map,
  api/game/plugins, api/game/plugin-modes, api/site-favicon.
- Rate limiting exists only for engine uploads (src/lib/engine/upload-rate-limit.ts) and in actions.ts.
- Sessions are JWT containing only steamId; role/ban are re-read from the DB per request (good; keep).
- src/lib/audit.ts writeAuditLog requires staff session.

TASKS
1. dev-login: require BOTH `NODE_ENV !== 'production'` AND `ENABLE_DEV_LOGIN === '1'`, AND
   `VERCEL_ENV` must not be 'production' or 'preview'. Return 404 otherwise. Restrict the created user
   to role 'player' by default; allow admin only if `DEV_LOGIN_ROLE=admin` is set. Add a test.
   Better: exclude the route from production builds via next.config.ts if feasible.
2. Owner backdoor: keep OWNER_STEAM_IDS working but move to env `OWNER_STEAM_IDS` (comma list) with the
   current value as a documented default ONLY when `ALLOW_DEFAULT_OWNER=1`. Log an audit entry
   (system) every time a login promotes someone to admin.
3. Public route review: for each route listed above add a header comment "PUBLIC: <why safe>" or
   add auth. Ensure none return user-specific or secret data, and that api/engine/download cannot be
   used for path traversal (read it carefully, add tests for `..`, encoded slashes, absolute paths).
4. Rate limiting: implement a small in-memory + Mongo-backed limiter (src/lib/rate-limit.ts;
   in-memory alone is unreliable on serverless, so persist counters in a RateLimit collection with a
   TTL/expires index). Apply to: Steam callback, purchase actions (shop, cases, premium, VIP),
   messaging/friend-request/report actions, forum posting, and /api/game/* POST routes. Return 429 with
   Retry-After. Make limits configurable constants in one file.
5. Input validation: audit server actions and API routes that accept free-form input (username, bio,
   messages, forum posts, clan names, uploads). Ensure zod schemas with max lengths exist; add the
   missing ones. Check src/components/ui/chart.tsx dangerouslySetInnerHTML: confirm the injected
   value can never contain user-controlled data (it is a theme <style> tag); add a comment or
   sanitize.
6. Security headers in next.config.ts: add CSP (report-only first), X-Content-Type-Options,
   Referrer-Policy, frame-ancestors (the embed profile route /embed/profile/[userId] must stay
   embeddable; scope accordingly), Permissions-Policy. Do not break Steam OpenID redirects, Clerk, or
   Vercel Blob images.
7. Ban enforcement audit: list every server action / API route and confirm each calls a helper that
   checks isBanned (and isMuted for chat/forum). Produce a table in docs/AUTHZ_MATRIX.md: route/action,
   auth required, role required, ban check, rate limit. Fix any gaps.

DO NOT
- Do not remove dev-login entirely without asking; do not remove the owner-admin mechanism, only make
  it configurable and audited.
- Do not enable CSP in enforcing mode in this phase.
- Do not change session strategy or cookie names.

ACCEPTANCE CRITERIA
- dev-login returns 404 unless all three conditions hold; test proves it.
- docs/AUTHZ_MATRIX.md exists and has no unchecked rows.
- Hammering a purchase endpoint 30 times/minute yields 429s.
- Steam login and Clerk email verification still work end to end.

GATE
npm run typecheck && npm test && npm run lint && npm run build
Manual: run the login flow, buy a shop item, trigger rate limit, load /embed/profile/<id> in an iframe.
```

---

# PHASE 5 — Game server audit (anti-cheat, desync, stability)

**Branch:** `phase-5/game-server`

Largest unknown in the audit: `server/src/rooms/HordeRoom.ts` (2,017 lines), `CompetitiveRoom.ts` (1,960), `DeathrunRoom.ts` (1,710) were **not** hand-reviewed and the server was never linted. Treat this phase as an investigation first, fixes second.

```
GOAL
Audit and harden the authoritative Colyseus server (/server) against cheating, crashes, and abuse, and
make match rewards trustworthy.

CONTEXT
- server/src/rooms: DeathrunRoom, HordeRoom, CompetitiveRoom (+ others), sim/ (13 files), join-token.ts,
  power-defs.ts, plugin-isolate-worker.mjs.
- Web -> game trust: HMAC join tokens (server/src/join-token.ts, src/lib/game-join-token.ts) carrying
  isPremium etc. Game -> web trust: POST /api/game/match-result authenticated with
  GAME_SERVER_ADMIN_SECRET (timing-safe, fail-closed; tests exist).
- CompetitiveRoom ~L976: Ranked access is enforced from join-token claims (isPremium / free-week flag).
  Premium can expire between token issue and use.
- server plugins: admin-published plugins with `server` permission ship source to the game server and
  run in plugin-isolate-worker.mjs.
- server/ was excluded from ESLint and tsconfig of root. Phase 0 added linting.

TASKS (investigation first: write findings to docs/GAME_SERVER_AUDIT.md BEFORE changing code)
1. Trust boundary review. For every `onMessage` handler in every room, check: is the payload validated
   (types, ranges, NaN/Infinity, array lengths, string lengths)? Is the client allowed to send
   position/velocity/damage/score directly, or does the server simulate? Rate-limit per client per
   message type (token bucket). Reject and disconnect clients that repeatedly send malformed data.
2. Movement/speed-hack and fire-rate checks: verify server-side max speed, teleport distance per tick,
   weapon cooldowns, ammo, and hit validation against server positions (lag compensation window
   bounded). Add tests using the existing sim/ parity tests as a model (src/lib/sim-parity.test.ts).
3. Join token hardening: token expiry short (<= 2 min), single-use nonce per room join, bound to
   userId and mode, isPremium re-verified at join by calling the web API (or by short expiry) rather
   than trusting a long-lived claim. Reconnection tokens must not be reusable across matches.
4. Match-result integrity: the server must only report results for matches it actually ran; add a
   matchId + HMAC of the payload; web side already de-duplicates via claimMatchResult, confirm the
   idempotency key is the matchId and cannot be replayed with a different player list. Guard against
   AFK-farming and one-player "matches" farming XP/VP (min players, min duration, min activity
   thresholds, configurable).
5. Ranked/KP: review Elo math for bounds (no NaN, no negative/overflow KP, floor handling), abandoned
   match penalty path (api/game/abandon-match), surrender vote edge cases (CompetitiveRoom ~L1133),
   reconnect window logic (~L1050): simulate disconnects and confirm no double-counting.
6. Stability: find unbounded arrays/maps that grow per tick or per client, timers/intervals that are
   not cleared in onDispose, unhandled promise rejections, and any `await` inside the tick loop. Add
   process-level handlers that log and do NOT crash the whole server on a single room error. Add
   max-clients and per-IP connection limits.
7. Plugin isolation: review plugin-isolate-worker.mjs for escape vectors (globals, require, process,
   fs, network, infinite loops, memory). Enforce CPU/time and memory limits, and a kill-switch.
   Document the threat model in docs/GAME_SERVER_AUDIT.md.
8. Add a /health endpoint reporting rooms, clients, uptime, tick p95; protect /monitor (Colyseus
   monitor) with basic auth or disable in production.
9. For each finding classify: Critical / High / Medium / Low, with file:line, exploit scenario, and
   fix. Implement all Critical and High fixes with tests; leave Medium/Low as a backlog list.

DO NOT
- Do not change game balance numbers, damage values, or map behavior.
- Do not change the wire protocol in a way that breaks the existing web client without a compat layer;
  if unavoidable, version it and tell me.
- Do not weaken any existing check.

ACCEPTANCE CRITERIA
- docs/GAME_SERVER_AUDIT.md lists findings with severity and status.
- Each Critical/High fix has a regression test.
- A scripted bot that sends malformed/oversized/high-rate messages cannot crash or stall a room.
- Server typecheck, build, and lint pass.

GATE
cd server && npm run typecheck && npm run build && cd .. && npm test
Run the server locally + a bot script (scripts/fuzz-room.ts, which you create) for 5 minutes with no crash.
```

---

# PHASE 6 — Refactor giant files (behavior-preserving)

**Branch:** `phase-6/refactor` (one sub-branch per file if you prefer)

Run only when Phases 0 to 5 are merged and CI is green. Refactor with tests as the guard rail.

```
GOAL
Split the largest files into cohesive modules WITHOUT changing behavior, so they are reviewable and
safe to modify.

TARGETS (lines)
- src/lib/social-actions.ts (2,584): mixes VIP/premium, store, friends, messages, admin actions,
  search, broadcasts.
- src/lib/progression-actions.ts (2,147)
- src/components/views/admin-view.tsx (2,415)
- src/components/game/editor/map-editor.tsx (5,954), editor-viewport.ts (4,693), map-document.ts (2,995)
- server/src/rooms/HordeRoom.ts, CompetitiveRoom.ts, DeathrunRoom.ts (share logic; extract common)

METHOD (strict)
1. Before touching a file, add characterization tests for its public functions (or confirm existing
   tests). Snapshot current outputs.
2. Split ONE file per PR. Move code verbatim into new files; keep the original file as a thin barrel
   that re-exports so no import elsewhere changes. Only in a follow-up commit update imports.
3. Suggested splits for social-actions.ts (note 'use server' must stay on each server-action file and
   every exported function must be async):
   src/lib/actions/vip-premium.ts, store.ts, friends.ts, messages.ts, admin-users.ts,
   admin-broadcast.ts, search.ts, shared/require-session.ts (dedupe the 3 copies of requireSessionUser
   found in clan-actions, clan-lobby-actions, case-actions into ONE helper that also checks isBanned).
4. admin-view.tsx: one component file per admin tab, lazy-loaded with next/dynamic to cut the hub
   bundle; keep props identical.
5. map-editor / editor-viewport: extract pure logic (math, snapping, serialization) into unit-testable
   modules first; leave React/Three lifecycle code last. No visual/behavior change; verify the editor
   loads, a map can be created, saved, and play-tested.
6. Enforce a max-file-length lint warning (max-lines 800) going forward.

DO NOT
- Do not rename exported functions or change signatures.
- Do not combine refactors with bug fixes or dependency bumps in the same commit.
- Do not touch generated code.

ACCEPTANCE CRITERIA
- No target file exceeds ~1,000 lines (editor files may stay larger but must be measurably smaller).
- Full test suite identical pass count; typecheck and build green; bundle size of the hub route not
  larger (report `next build` output before/after).

GATE
npm run typecheck && npm test && npm run lint && npm run build
```

---

# PHASE 7 — Schema and ops hygiene

**Branch:** `phase-7/ops`

```
GOAL
Make deployments and data changes safe, observable, and reproducible.

CONTEXT
- MongoDB via Prisma `db push` only (no migration history). Admin "Sync database schema" button in
  src/lib/admin-db-sync.ts with a version constant `2026-07-22-party-seasons`.
- No error monitoring found; 19 console.log calls; no health checks; no backups documented.

TASKS
1. Schema change log: create docs/SCHEMA_CHANGELOG.md and prisma/CHANGES/ with a dated note per schema
   change (including vipExpiresAt from Phase 1, VpTransaction and PendingRefund from Phase 2). Make
   admin-db-sync bump its version constant automatically from a single source, and fail CI if
   schema.prisma changed without a changelog entry.
2. Indexes: review prisma/schema.prisma for missing indexes on hot queries (leaderboard sorts by
   kp/xp, user search by username, inventory by userId, messages by receiver+createdAt,
   notifications by userId, matchResult by userId). Add @@index where needed. Note Mongo case-insensitive
   `contains` (used in searchPlayers) cannot use a normal index: add a normalized lowercase field or a
   text index and update the query, keeping the current fallback.
3. Observability: add structured logging (small logger wrapper, JSON in production), replace
   console.log, and wire Sentry (or equivalent) for both Next.js and the Colyseus server behind an
   env flag so it is a no-op when unset.
4. Backups and recovery: write docs/RUNBOOK.md covering Atlas backups/PITR, how to restore a single
   user, how to run the Phase 1 and Phase 2 scripts safely, rollback for a bad deploy, and the
   post-deploy checklist (sync schema, seed, restart Colyseus, set active maps).
5. Env validation: add src/lib/env.ts using zod that validates required env vars at boot (fail fast
   with a clear message, never printing values). Update .env.example to match exactly.
6. Prisma 7 evaluation follow-up: only if docs/PRISMA_7_EVALUATION.md concluded it is safe, plan the
   migration as a separate epic. Otherwise leave.
7. Update README.md and docs/AUDIT.md to reflect all changes (VIP semantics, cron, ledger, rate limits).

DO NOT
- Do not drop or rename existing collections/fields.
- Do not run schema pushes against production.

ACCEPTANCE CRITERIA
- A new developer can follow RUNBOOK.md and README.md from zero to running hub + game server.
- Missing a required env var fails startup with a clear message.
- Slow-query candidates each have an index or a documented reason not to.

GATE
npm run typecheck && npm test && npm run lint && npm run build
```

---

## After all phases: final verification prompt

```
FINAL VERIFICATION
On a fresh clone: npm ci, prisma generate, typecheck, lint, test, build, audit, and the server's
typecheck/build. Then produce FINAL_REPORT.md: per phase, what was done, what was deferred, remaining
risks, and the top 10 next steps. Do not change any code in this step.
```

## Operator notes for you

- **Phase 1 needs a decision from you first** (Option A vs B). Send me what the admin panel shows for that user's `isVip`, `role` and `premiumExpiresAt` and I'll tell you which case it is.
- **Phase 2 needs a MongoDB replica set** for `$transaction` (Atlas has one; a plain local `mongod` does not). Tell your agent to use `mongod --replSet` for local tests.
- **Never let the agent run `--apply` scripts or `db push` on production.** You run those after reading the dry-run output.
- **Merge after each gate passes**, not at the end. If a phase goes sideways, you lose one branch, not the whole audit.
- **Some findings come from static reading only** (I couldn't generate the Prisma client in my sandbox, so I never ran the app). The agent's Phase 0 baseline will confirm real typecheck and lint numbers.


<invoke name="present_files">
<parameter name="filepaths">["/mnt/user-data/outputs/KILRUN_AGENT_PHASES.md"]