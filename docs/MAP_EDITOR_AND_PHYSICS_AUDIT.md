# Kilrun Map Editor & Physics Audit

**Date:** 2026-07-20  
**Scope:** Admin map editor (`src/components/game/editor/**`), Deathrun match load path (`kilrun-engine` + `DeathrunRoom`), and authoritative platformer sim (`server/src/sim/**`).  
**Audience:** Product / owner — can you easily build map content and does the game feel like a real platformer?

---

## Executive verdicts

| Question | Verdict | One-line answer |
|---|---|---|
| Can I **easily create** maps, place elements/entities, and ship them into play? | **Partial — usable, not yet “easy / pro”** | Yes for a motivated admin: place floors, props, spawns, buttons/traps, save, set MAIN, playtest visually. No for frictionless content ops (localStorage only, weak collision export, live match ≠ play-test feel). |
| Is **game physics fully operational** like market platformers (Mario / Celeste-class basics)? | **Partial — solid core, incomplete depth** | Authoritative sim has gravity, accel/friction, coyote + jump buffer, sprint energy, void fall. Missing variable jump cut, real wall/stair collision, slopes, moving platforms, and editor play-test uses a **different** lighter physics. |

**Bottom line:** You *can* build and activate custom MAP courses today, and Deathrun movement is already a real platformer core — but it is **not** yet “any other platformer on the market” in polish, collision fidelity, or editor ↔ match parity. Treat the roadmap below as required before marketing map creation as a finished feature.

---

## Part A — Map editor audit

### A1. What works today

- **Full-viewport editor** via portal (`map-editor.tsx`) with free-fly camera, grid snap, layers, selection, ESC hierarchy.
- **Entity kinds:** `prop`, `spawn_runner`, `spawn_trapper`, `checkpoint`, `hazard`, `trap`, `group`, `player`, `button` (`map-document.ts`).
- **Large prototype GLB catalog** (`prototype-catalog.ts`) — floors, walls, stairs, doors, buttons, crates, pipes, etc.
- **Custom GLB / texture uploads**, animation director (proximity / interact / collide / signal / always).
- **Prefabs** — stamp selection as prefab, re-instantiate (`prefab-storage.ts`).
- **Validation before publish** — requires runner spawn + ≥3 floor pieces (`map-validate.ts`).
- **Thumbnails** generated offline (`map-thumbnail.ts`).
- **Play Test** preview walkthrough with dual joysticks on mobile (`map-play-preview.tsx`).
- **MAIN / Active Match Map** — local flag `kilrun.activePlayMapId.v1`; client converts floors → sim platforms and sends `loadCustomMap` (`prefab-storage.ts`, `kilrun-engine.tsx`, `DeathrunRoom.ts`).
- **Starter floors** / empty-map heal for old docs (`map-document` / storage helpers).
- **Mobile editor controls** — dual sticks + Sprint / Edit / Fly buttons.

### A2. Supported element inventory (practical)

| Kind | Editor | Visual in match | Authoritative collide / kill |
|---|---|---|---|
| Floor / platform props (`*floor*`) | Yes | Often skipped in overlay (server pad instead) | **Yes** (top-plane pads) |
| Checkpoint | Yes | Pad kind | Platform presence; checkpoint *gameplay rules* limited |
| Walls / columns / stairs / doors | Yes | Yes (overlay) | **No solid wall collision** (vis only) |
| Buttons + signal → traps/doors | Yes | Animations via overlay / director | **Client FX**; not full server trap authority |
| Hazards (damage / instant kill) | Yes | Mesh overlay | **Not** full Deathrun server obstacle pipeline |
| Runner / trapper spawn | Yes | Used as start | Spawn remapped to sim axes |
| Prefab stamps | Yes | As entities | Same limitations as ingredients |
| Default timed deathrun obstacles | N/A | Default course | Cleared when custom map loads |

### A3. Play path (editor → live game)

```
Editor Save (localStorage JSON)
   → Set Active / MAIN
   → Join Deathrun
   → kilrun-engine reads getActivePlayMapId()
   → mapDocToSimPlatforms(doc) + spawn
   → room.send('loadCustomMap', { platforms, spawn })
   → DeathrunRoom replaces PlatformState list, clears default obstacles
   → CustomMapOverlay draws non-floor props on client
```

### A4. Pain points / bugs / blockers for “easy creation”

1. **Storage is browser `localStorage` only** (`map-storage.ts`)  
   - Maps/thumbnails/prefabs do **not** sync across machines or staff.  
   - Risk: quota / wipe / “lost maps”.  
   - **Blocker** for multi-admin or production content pipeline.

2. **Collision export is floor-name heuristic** (`mapDocToSimPlatforms`)  
   - Only `floor` / `checkpoint` (or loose “floor-like” fallback) become solid pads.  
   - Walls, stairs, crates, thick props → **walk-through**.  
   - Scale→pad size is approximate (`scale * 2`), rotates ignored for AABB tops.

3. **Play Test ≠ Match physics**  
   - Preview: freefly-ish walk, floaty jump to `y=1.6`, no real pad collision with editor floors.  
   - Match: server `applyMovement` + platform tops.  
   - Admins can “pass” play-test then fail in room.

4. **World bounds still default course size** (`server/src/sim/constants.ts`)  
   - `WORLD_WIDTH = 48`, `WORLD_HEIGHT = 10` clamp player XY.  
   - Large custom maps / pads outside that box will feel broken (wall of invisible world edge).  
   - **Critical** for big editor courses.

5. **Editor hazards / button traps are not the Deathrun server obstacle system**  
   - Loading custom map **clears** `createDeathrunObstacles()`.  
   - Visual traps animate; kills/damage are inconsistent vs classic timed bars.

6. **Active map is per-browser localStorage**  
   - “MAIN” is not a shared server setting. Another client/session may still run the built-in course.

7. **No undo/redo stack documented as robust**; axis gizmo / multi-select UX still contentious for non-technical creators.

8. **No slope / mesh collider baking** — stairs are decorative unless manually approximated with many pads.

9. **Coordinate remap** editor Y-up Three → sim `(x forward, y lateral, z height)` is easy to get wrong when hand-tuning.

10. **Finish line / course length** still tied to legacy `FINISH_X` / width constants — finish may not match custom path end.

### A5. Map editor verdict (detail)

**Partial.** A technical admin who knows “floors = collision” can ship a linear pad course and activate it. A casual designer expecting Roblox/UE-level “drop anything and it collides / kills / saves to cloud” will bounce.

---

## Part B — Physics / platformer audit

### B1. What the live match already has (good)

Authoritative loop: clients send **intent only** (`input`); server steps at ~30 Hz (`DeathrunRoom` + `applyMovement` in `server/src/sim/movement.ts`).

| Feature | Status | Notes |
|---|---|---|
| Gravity + max fall speed | Yes | `GRAVITY`, `MAX_FALL_SPEED` |
| Jump from ground | Yes | `JUMP_VELOCITY` |
| Coyote time | Yes | `COYOTE_TIME_MS = 90` |
| Jump buffering | Yes | `JUMP_BUFFER_MS = 110`, edge trigger |
| Ground accel / friction | Yes | Quake-inspired |
| Air accel / air control | Yes | Cap via `MAX_AIR_SPEED_MULT` |
| Sprint + stamina | Yes | Energy drain/regen/exhaust |
| Crouch speed | Yes | `CROUCH_SPEED_MULTIPLIER` |
| Platform landing / support | Yes | `findSupportPlatform` AABB top |
| Void death | Yes | `VOID_Z` |
| Role speed variants | Yes | trapper slightly slower |
| Mobile dual sticks | Yes | Client input mapped into wishdir |

This is a **real platformer core**, not a prototype float.

### B2. Missing vs market platformers

| Feature | Status | Impact |
|---|---|---|
| Variable jump height (release cut) | **Missing** | Jumps feel fixed-height / less expressive |
| Apex hang / Celeste-style control | Partial | Air control exists; no dedicated apex |
| Wall collision / wall jump | **Missing** | Walls are mesh-only |
| Slopes / stairs as surfaces | **Missing** | Stairs not collider-mesh |
| Moving platforms (kinematic carry) | **Missing** | |
| One-way / drop-through platforms | Limited | Tops only; drop-through not authored |
| Edge forgiveness / corner correction | Weak | Can snag pad corners |
| Client prediction + reconciliation | Weak / none visible | 30 Hz authority feels laggy on high ping |
| Separate land/jump SFX timing hooks | Partial | Anim slots exist in editor player entity |
| Play-test uses same `applyMovement` | **No** | Dual physics truth |
| Custom map expands world AABB | **No** | Hard clamp 48×10 |

### B3. Physics verdict (detail)

**Partial.** Comparable to a solid **early-access** arena platformer / Quake-horizontal + Mario-lite vertical — **not** “fully operational like any platformer on the market.” Core jump forgives (coyote/buffer) are present; depth features and geometry fidelity are not.

---

## Part C — Cross-cutting risks

1. **Two physics minds** — editor play-test vs server match.  
2. **Two collision minds** — visual GLB vs flat pad tops.  
3. **Two map truths** — local MAIN vs shared multiplayer expectation.  
4. **Obstacle identity gap** — classic deathrun bars cleared on custom load; editor traps don’t fully replace them on server.

---

## Part D — Phased improvement roadmap

### Phase 0 — Stabilize what’s shipped (1–2 weeks)

**Goal:** Stop silent footguns so MAIN maps actually play.

- [ ] Raise / dynamic world bounds from map AABB when loading custom platforms.  
- [ ] Persist **Active MAIN map id + document** on **server/SiteSettings** (not only localStorage).  
- [ ] Warn in editor UI: “Only floor*/checkpoint collide.”  
- [ ] After Set MAIN, toast: “Rejoin match to reload platforms.”  
- [ ] Unit tests: `mapDocToSimPlatforms` axes + spawn remap.  
- [ ] Fix finish detection for custom map length (or place `finish` entity kind).

**Exit:** A documented 5-pad linear map plays for any joining client after staff publishes MAIN once.

---

### Phase 1 — Editor ↔ match parity (2–3 weeks)

**Goal:** Play Test uses **the same** `applyMovement` + platforms as the room.

- [ ] Compile platforms in play-test from `mapDocToSimPlatforms`.  
- [ ] Run local headless tick of `applyMovement` (or shared package) in preview.  
- [ ] Show collision pads as debug overlays (toggle).  
- [ ] Sync jump/gravity constants UI ↔ `server/src/sim/constants.ts`.  
- [ ] Hazard touch damage authoritative (room messages or reintroduce obstacle schema from entities).

**Exit:** If you clear Play Test, you clear a live match on the same map.

---

### Phase 2 — Collision fidelity (3–4 weeks)

**Goal:** Geometry creators can trust walls and stacked floors.

- [ ] Explicit `collider: 'box' | 'none' | 'top'` on entities (no name heuristics).  
- [ ] Bake boxes including walls (axis-aligned first).  
- [ ] Optional stair ≈ stepped pads auto-generator.  
- [ ] Corner correction / skin width to reduce snags.  
- [ ] Visual gizmo: green = solid, red = decor.

**Exit:** A corridor with walls contains the player; stairs are climbable without 20 hand pads.

---

### Phase 3 — Market jump feel (2 weeks)

**Goal:** Jump readability like Mario / modern indies.

- [ ] Variable jump cut (release → multiply `vz` if ascending).  
- [ ] Optional early coyote tweak + apex gravity tweak.  
- [ ] Land/jump animation hooks synced to `isGrounded` / `vz`.  
- [ ] Tune pass: Celeste-ish forgiveness without floatiness.  
- [ ] Camera follow polish during large vertical rooms.

**Exit:** Feel-test pass from 3 players: “jumps feel intentional.”

---

### Phase 4 — Trap / deathrun content pipeline (3 weeks)

**Goal:** Editor traps replace default obstacles for real.

- [ ] Server entity runtime: timed spikes, toggling floors, crushers from map JSON.  
- [ ] Button signals authoritative (room state channels).  
- [ ] Checkpoints with respawn Z (not just pads).  
- [ ] Kill volumes that match hazard panel.  
- [ ] Keep classic default course as fallback when no MAIN set.

**Exit:** A button opens a door / disables a kill floor in multiplayer, not just client animation.

---

### Phase 5 — Content ops & multiplayer authorship (2–3 weeks)

**Goal:** Easy for staff, not one browser.

- [ ] Map CRUD in DB / Blob (list, fork, version, publish MAIN).  
- [ ] Prefab library shared.  
- [ ] Thumbnail CDN.  
- [ ] Map play stats (wr attempts, fall deaths heat).  
- [ ] Role permission: admin publish, mod draft.

**Exit:** Two admins on two PCs can co-edit via publish, not “export JSON by Discord.”

---

### Phase 6 — Netcode feel (2–4 weeks)

**Goal:** High-ping players don’t hate physics.

- [ ] Client-side prediction of `applyMovement` + reconciliation.  
- [ ] Input delay compensation / slightly higher tick optional.  
- [ ] Rubber-band thresholds tuned.  
- [ ] Spectator / ghost VFX for lags.

**Exit:** Physics reads fair on 80–120 ms RTT.

---

### Phase 7 — Nice-to-haves / addons (ongoing)

- Moving platforms & conveyor pads.  
- Ice / sticky materials.  
- Portal / teleporter entities.  
- Race ghost leaderboard on custom maps.  
- In-editor “validate playable path” auto-bot.  
- Undo/redo forever, copy/paste between maps.  
- Terrain height brushes (longer term).  
- AI suggest trap placements.

---

## Part E — Suggested priority if you only do three things

1. **Server-side MAIN map + dynamic world bounds** (Phase 0) — otherwise custom maps lie.  
2. **Play Test = match physics** (Phase 1) — otherwise creators can’t trust testing.  
3. **Explicit colliders / wall boxes** (Phase 2) — otherwise “entities” are decorations.

---

## Part F — File map (quick reference)

| Area | Paths |
|---|---|
| Editor UI | `src/components/game/editor/map-editor.tsx`, `editor-viewport.ts`, `editor-help.tsx` |
| Document model | `src/components/game/editor/map-document.ts` |
| Storage / thumbs | `src/components/game/editor/map-storage.ts`, `map-thumbnail.ts` |
| Collision export | `src/components/game/editor/prefab-storage.ts` (`mapDocToSimPlatforms`) |
| Validate | `src/components/game/editor/map-validate.ts` |
| Play test | `src/components/game/editor/map-play-preview.tsx` |
| Live overlay | `src/components/game/entities/custom-map-overlay.ts` |
| Match client load | `src/components/game/kilrun-engine.tsx` |
| Room | `server/src/rooms/DeathrunRoom.ts` |
| Physics | `server/src/sim/movement.ts`, `platforms.ts`, `constants.ts`, `collision.ts` |
| Admin entry | `src/components/views/admin/admin-map-editor-panel.tsx` |

---

## Part G — Honest answers to your questions

### “Is it going to work for me — easy to create map elements / entities and play the actual game?”

**Yes, with training wheels and rules.**  
Use floor pieces for every standable surface, place a runner spawn, validate, set MAIN, rejoin Deathrun. Decor walls/doors look good but mostly don’t block. Do not trust Play Test alone.

### “Make sure GAME physics is fully operational and works like any other platformer on market!”

**Not yet fully.** Core pad platforming is operational and intentionally designed (coyote, buffer, friction, sprint). Market parity needs Phase 2–3 (colliders + variable jump) and preferably Phase 6 (prediction). Until then, call it **solid mid-core**, not AAA indie platformer feel.

---

## Part H — Deep-dive addendum (post-audit review)

Extra high-severity findings confirmed in a second pass of the editor + sim. Fold these into Phase 0–2 tickets.

### H1. Map / multiplayer authenticity

| Finding | Risk | Suggested phase |
|---|---|---|
| `loadCustomMap` is not role-gated — any lobby client can replace platforms | Griefing / overwrite | **Phase 0** |
| MAIN map + overlay meshes live in **publisher’s** `localStorage`; other clients get pads (if pushed) but may miss props/traps | Visual desync | **Phase 0 / 5** |
| Starter empty-map floors reach ~X=16 while finish is hardcoded `FINISH_X ≈ 46` | New maps “impossible” to finish | **Phase 0** |
| Trapper spawn extracted but **never applied** in match (everyone uses runner spawn) | Role imbalance | **Phase 0** |
| `group` entity kind has no place UI; `isAdmin` prop on `MapEditor` unused | Dead surface / weak guards | Phase 3 polish |
| Checkpoints tagged on pads but **no respawn logic** in sim | Misleading kind | Phase 4 |
| Custom map **clears** default timed obstacles with no authoring replacement | Empty deathrun | Phase 4 |

### H2. Physics / input edge cases

| Finding | Risk | Suggested phase |
|---|---|---|
| No **jump cut** — `wasJumpHeld` only edges the buffer | Fixed-height only | **Phase 3** |
| Jump can soft-fail when energy &lt; `JUMP_ENERGY_COST * 0.25` with little feedback | “Dead” Space bar | Phase 1 / 3 |
| Short mobile jump taps can miss a 30 Hz send frame | Missed jumps | Phase 1 (press latch) |
| No side/underside AABB push-out — walk through pad volumes; jump up through floors | Unfair / soft walls | **Phase 2** |
| Horizontal velocity lives only in server `PlayerSimScratch` (not synced); clients lerp `x,y,z` | Laggy feel | Phase 6 |
| Mobile has **no crouch** mapped | Feature gap | Phase 3 nice-to-have |
| `findSupportPlatform` snap window can attach oddly near stacked pad edges | Snags / float | Phase 2 |

### H3. Solo-admin workflow that works *today*

1. Admin → Map Editor → New  
2. Place **many** `floor*` pieces long enough toward finish (~world X ~46)  
3. Place **Runner Spawn**  
4. Save → **Set as MAIN**  
5. Join Deathrun from **that same browser** while still in lobby/countdown so `loadCustomMap` fires  
6. Treat walls/stairs/doors as **decor only** until Phase 2  

Do **not** use Play Test alone to judge gap difficulty.

---

## Change log

| Date | Note |
|---|---|
| 2026-07-20 | Initial audit from codebase review; no runtime play session logged in this doc. |
| 2026-07-20 | Added Part H deep-dive from follow-up editor + physics audits (security, finish/spawn gaps, jump/net edge cases). |

*Re-run this audit after Phase 0–1 land; update verdicts in the table at the top.*
