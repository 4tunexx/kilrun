# Kilrun Map Editor & Physics Audit

**Date:** 2026-07-20 (updated)  
**Scope:** Admin map editor (`src/components/game/editor/**`), Deathrun match load path (`kilrun-engine` + `DeathrunRoom`), and authoritative platformer sim (`server/src/sim/**`).  
**Audience:** Product / owner — can you easily build map content and does the game feel like a real platformer?

---

## Executive verdicts

| Question | Verdict | One-line answer |
|---|---|---|
| Can I **easily create** maps, place elements/entities, and ship them into play? | **Improved — closer to “easy”** | Place floors/props, mark **Solid**, add **Jump pads** / **Death zones** / **Lights**, save, set MAIN, play. Still blocked on cloud sync + world bounds + wall box collision. |
| Is **game physics fully operational** like market platformers (Mario / Celeste-class basics)? | **Partial — solid core, incomplete depth** | Authoritative sim has gravity, accel/friction, coyote + jump buffer, sprint energy, void fall, **jump pads**, **editor hazard damage**. Missing variable jump cut, real wall/stair AABB, slopes, moving platforms, play-test ≠ match physics. |

**Bottom line:** Custom maps can now author walkable props, jump pads, damage volumes, and lights. Collision is still **top-plane pads** (not full mesh/wall boxes). Treat remaining Phase 0–2 items as required before marketing map creation as finished.

---

## Part A — Map editor audit

### A1. What works today

- **Full-viewport editor** via portal (`map-editor.tsx`) with free-fly camera, grid snap, layers, selection, ESC hierarchy.
- **Mobile chrome collapse** — Hide UI / Menus, overlay library drawer, collapsible tools + properties.
- **Entity kinds:** `prop`, `spawn_runner`, `spawn_trapper`, `checkpoint`, `hazard`, `trap`, `group`, `player`, `button`, **`light`** (`map-document.ts`).
- **Gameplay on selection:** **Solid** collider export, **Jump pad** (+ boost), **Death zone** damage / instant kill, **Light bulb** (color / intensity / distance).
- **Large prototype GLB catalog** (`prototype-catalog.ts`) — floors, walls, stairs, doors, buttons, crates, pipes, etc.
- **Custom GLB / texture uploads**, animation director (proximity / interact / collide / signal / always).
- **Prefabs** — stamp selection as prefab, re-instantiate (`prefab-storage.ts`).
- **Validation before publish** — requires runner spawn + ≥3 floor pieces (`map-validate.ts`).
- **Thumbnails** generated offline (`map-thumbnail.ts`).
- **Play Test** preview walkthrough with dual joysticks on mobile (`map-play-preview.tsx`).
- **MAIN / Active Match Map** — local flag `kilrun.activePlayMapId.v1`; client converts pads + hazards → `loadCustomMap`.
- **Starter floors** / empty-map heal for old docs.
- **Mobile editor controls** — dual sticks + Sprint / Edit / Fly buttons.

### A2. Supported element inventory (practical)

| Kind / feature | Editor | Visual in match | Authoritative collide / kill |
|---|---|---|---|
| Floor / platform props (`*floor*`) | Yes | Often skipped in overlay (server pad instead) | **Yes** (top-plane pads) |
| **Start** | Yes | Marker (skipped in match overlay) | Spawn point for runners |
| **Finish** | Yes | Amber pad overlay | **Yes** — touch/step marks finished |
| **Any prop with Solid ✓** | Yes | Mesh overlay | **Yes** (top-plane pad from position/scale) |
| Checkpoint | Yes | Pad kind | Platform presence; respawn rules still limited |
| **Jump pad** | Yes (Gameplay panel) | Cyan pad / tint when no mesh | **Yes** — launches with `boost` |
| Walls / columns / stairs / doors (decor) | Yes | Yes (overlay) | **No** unless Solid turned on (still top-plane, not wall box) |
| Buttons + signal → traps/doors | Yes | Animations via overlay / director | **Client FX**; not full server trap authority |
| Hazards / death zone | Yes | Mesh overlay | **Yes** — exported as always-active damage obstacles |
| **Light bulb** | Yes | Point light + bulb in overlay | Visual only (client) |
| Runner / trapper spawn | Yes | Used as start | Runner spawn remapped; trapper spawn still unused in match |
| Prefab stamps | Yes | As entities | Same as ingredients |
| Default timed deathrun obstacles | N/A | Default course | Cleared when custom map loads (replaced by editor hazards if any) |

### A3. Play path (editor → live game)

```
Editor Save (localStorage JSON)
   → Set Active / MAIN
   → Join Deathrun
   → kilrun-engine reads getActivePlayMapId()
   → mapDocToSimPlatforms(doc)  // solid / floor / jumpPad / checkpoint
   → mapDocToSimHazards(doc)    // damage volumes
   → room.send('loadCustomMap', { platforms, obstacles, spawn })
   → DeathrunRoom replaces platforms + obstacles
   → CustomMapOverlay draws props / traps / lights on client
```

### A4. Pain points / bugs / blockers for “easy creation”

1. **Storage is browser `localStorage` only** (`map-storage.ts`)  
   - Maps/thumbnails/prefabs do **not** sync across machines or staff.  
   - **Blocker** for multi-admin or production content pipeline.

2. **Collision is top-plane pads only**  
   - `solid` / floors export AABB tops — good for crates and floors.  
   - **Walls still don’t block sideways** (no vertical box push-out).  
   - Scale→pad size approximate; rotation ignored for pad AABB.

3. **Play Test ≠ Match physics**  
   - Preview: freefly-ish walk, floaty jump, client hazard HP.  
   - Match: server `applyMovement` + pads + hazard obstacles.  
   - Admins can “pass” play-test then fail in room.

4. **World bounds still default course size** (`server/src/sim/constants.ts`)  
   - `WORLD_WIDTH = 48`, `WORLD_HEIGHT = 10` clamp player XY.  
   - **Critical** for big editor courses.

5. **Timed / moving deathrun traps** still not authored as server obstacles  
   - Editor button→trap animations are mostly client FX.  
   - Static damage volumes **do** export now.

6. **Active map is per-browser localStorage**  
   - “MAIN” is not a shared server setting.

7. **No slope / mesh collider baking** — stairs need Solid pads stacked by hand.

8. **Coordinate remap** editor Y-up Three → sim `(x forward, y lateral, z height)`.

9. **Finish line / course length** still tied to legacy `FINISH_X`.

10. **`loadCustomMap` not role-gated** — any lobby client can replace platforms (Phase 0 security).

### A5. Map editor verdict (detail)

**Improved.** Turning on **Solid** / **Jump pad** / **Death zone** on a selected object is now first-class. Lights light the scene in editor + match overlay. Remaining gaps: cloud MAIN, world bounds, wall boxes, play-test parity.

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
| **Jump pads** | **Yes** | `kind: 'jumpPad'` + `boost` / `JUMP_PAD_BOOST` |
| **Editor hazard damage** | **Yes** | Always-active `ObstacleState` from map export |
| Void death | Yes | `VOID_Z` |
| Role speed variants | Yes | trapper slightly slower |
| Mobile dual sticks | Yes | Client input mapped into wishdir |

### B2. Missing vs market platformers

| Feature | Status | Impact |
|---|---|---|
| Variable jump height (release cut) | **Missing** | Jumps feel fixed-height / less expressive |
| Apex hang / Celeste-style control | Partial | Air control exists; no dedicated apex |
| Wall collision / wall jump | **Missing** | Solid walls are still top pads only |
| Slopes / stairs as surfaces | **Missing** | Stairs not collider-mesh |
| Moving platforms (kinematic carry) | **Missing** | |
| One-way / drop-through platforms | Limited | Tops only; drop-through not authored |
| Edge forgiveness / corner correction | Weak | Can snag pad corners |
| Client prediction + reconciliation | Weak / none visible | 30 Hz authority feels laggy on high ping |
| Play-test uses same `applyMovement` | **No** | Dual physics truth |
| Custom map expands world AABB | **No** | Hard clamp 48×10 |

### B3. Physics verdict (detail)

**Partial.** Core pad platforming + jump pads + damage volumes are operational. Market parity still needs wall boxes, variable jump, and prediction.

---

## Part C — Cross-cutting risks

1. **Two physics minds** — editor play-test vs server match.  
2. **Two collision minds** — visual GLB vs flat pad tops (even with Solid).  
3. **Two map truths** — local MAIN vs shared multiplayer expectation.  
4. **Obstacle identity gap** — classic timed bars cleared on custom load; static editor hazards fill part of the gap; moving traps still missing.

---

## Part D — Phased improvement roadmap

### Phase 0 — Stabilize what’s shipped

**Goal:** Stop silent footguns so MAIN maps actually play.

- [x] Raise / dynamic world bounds from map AABB when loading custom platforms.  
- [ ] Persist **Active MAIN map id + document** on **server/SiteSettings** (not only localStorage).  
- [x] ~~Warn in editor UI: “Only floor*/checkpoint collide.”~~ → **Replaced** by explicit Solid / Jump pad / Death zone controls + green/cyan pad gizmos.  
- [ ] After Set MAIN, toast: “Rejoin match to reload platforms.”  
- [ ] Unit tests: `mapDocToSimPlatforms` / `mapDocToSimHazards` axes + spawn remap.  
- [x] Finish detection via editor **Finish** entity (touch/step); falls back to `FINISH_X` when none.  
- [ ] Role-gate `loadCustomMap` (admin / lobby host only).  
- [x] Apply trapper spawn from map doc in match.  
- [x] **Start** entity as player spawn (legacy `spawn_runner` still accepted).

**Exit:** A documented solid/jump-pad map plays for any joining client after staff publishes MAIN once.

---

### Phase 1 — Editor ↔ match parity

**Goal:** Play Test uses **the same** `applyMovement` + platforms as the room.

- [ ] Compile platforms in play-test from `mapDocToSimPlatforms`.  
- [ ] Run local headless tick of `applyMovement` (or shared package) in preview.  
- [ ] Show collision pads as debug overlays (toggle) — editor already shows solid/jump gizmos; match needs toggle.  
- [ ] Sync jump/gravity constants UI ↔ `server/src/sim/constants.ts`.  
- [x] Hazard touch damage authoritative (editor hazards → always-active obstacles on `loadCustomMap`).

**Exit:** If you clear Play Test, you clear a live match on the same map.

---

### Phase 2 — Collision fidelity

**Goal:** Geometry creators can trust walls and stacked floors.

- [x] Explicit solid authoring on entities (`solid` boolean + jumpPad) — no longer floors-only heuristic (heuristic kept as default for `floor*` / checkpoint).  
- [ ] Bake **vertical wall boxes** (axis-aligned push-out), not only top pads.  
- [ ] Collider mode enum refinement: `'box' | 'none' | 'top'` if wall boxes land.  
- [ ] Optional stair ≈ stepped pads auto-generator.  
- [ ] Corner correction / skin width to reduce snags.  
- [x] Visual gizmo: green = solid pad, cyan = jump pad, red = hazard (editor).

**Exit:** A corridor with walls contains the player; stairs are climbable without 20 hand pads.

---

### Phase 3 — Market jump feel

**Goal:** Jump readability like Mario / modern indies.

- [ ] Variable jump cut (release → multiply `vz` if ascending).  
- [ ] Optional early coyote tweak + apex gravity tweak.  
- [ ] Land/jump animation hooks synced to `isGrounded` / `vz`.  
- [ ] Tune pass: Celeste-ish forgiveness without floatiness.  
- [ ] Camera follow polish during large vertical rooms.  
- [x] Jump pads (authoritative boost on land / stand).

**Exit:** Feel-test pass from 3 players: “jumps feel intentional.”

---

### Phase 4 — Trap / deathrun content pipeline

**Goal:** Editor traps replace default obstacles for real.

- [ ] Server entity runtime: timed spikes, toggling floors, crushers from map JSON.  
- [ ] Button signals authoritative (room state channels).  
- [ ] Checkpoints with respawn Z (not just pads).  
- [x] Kill / damage volumes that match hazard panel (static always-on).  
- [ ] Keep classic default course as fallback when no MAIN set.  
- [x] Jump pad entity gameplay (via platform kind).

**Exit:** A button opens a door / disables a kill floor in multiplayer, not just client animation.

---

### Phase 5 — Content ops & multiplayer authorship

**Goal:** Easy for staff, not one browser.

- [ ] Map CRUD in DB / Blob (list, fork, version, publish MAIN).  
- [ ] Prefab library shared.  
- [ ] Thumbnail CDN.  
- [ ] Map play stats (wr attempts, fall deaths heat).  
- [ ] Role permission: admin publish, mod draft.

**Exit:** Two admins on two PCs can co-edit via publish, not “export JSON by Discord.”

---

### Phase 6 — Netcode feel

**Goal:** High-ping players don’t hate physics.

- [ ] Client-side prediction of `applyMovement` + reconciliation.  
- [ ] Input delay compensation / slightly higher tick optional.  
- [ ] Rubber-band thresholds tuned.  
- [ ] Spectator / ghost VFX for lags.

**Exit:** Physics reads fair on 80–120 ms RTT.

---

### Phase 7 — Nice-to-haves / addons (ongoing)

- [x] Point lights as placeable entities (client visual).  
- Moving platforms & conveyor pads.  
- Ice / sticky materials.  
- Portal / teleporter entities.  
- Race ghost leaderboard on custom maps.  
- In-editor “validate playable path” auto-bot.  
- Undo/redo forever, copy/paste between maps.  
- Terrain height brushes (longer term).  
- AI suggest trap placements.  
- Shadow-casting toggle polish for lights.  
- Finish-line entity + course length auto-bound.

---

## Part E — Suggested priority if you only do three things next

1. **Server-side MAIN map + dynamic world bounds** (Phase 0) — otherwise custom maps lie for other clients / big courses.  
2. **Play Test = match physics** (Phase 1) — otherwise creators can’t trust testing.  
3. **Vertical wall boxes** (Phase 2) — Solid tops alone aren’t enough for corridors.

---

## Part F — File map (quick reference)

| Area | Paths |
|---|---|
| Editor UI | `src/components/game/editor/map-editor.tsx`, `editor-viewport.ts`, `editor-help.tsx` |
| Document model | `src/components/game/editor/map-document.ts` (`solid`, `jumpPad`, `light`, kinds) |
| Storage / thumbs | `src/components/game/editor/map-storage.ts`, `map-thumbnail.ts` |
| Collision / hazard export | `src/components/game/editor/prefab-storage.ts` (`mapDocToSimPlatforms`, `mapDocToSimHazards`) |
| Validate | `src/components/game/editor/map-validate.ts` |
| Play test | `src/components/game/editor/map-play-preview.tsx` |
| Live overlay | `src/components/game/entities/custom-map-overlay.ts` |
| Match client load | `src/components/game/kilrun-engine.tsx` |
| Room | `server/src/rooms/DeathrunRoom.ts` |
| Physics | `server/src/sim/movement.ts`, `platforms.ts`, `constants.ts`, `collision.ts` |
| Schema | `server/src/schema/RoomState.ts` (`jumpPad`, `boost`, obstacle `damage` / `alwaysActive`) |
| Admin entry | `src/components/views/admin/admin-map-editor-panel.tsx` |

---

## Part G — Honest answers to your questions

### “Is it going to work for me — easy to create map elements / entities and play the actual game?”

**Yes, with clearer rules.**  
Select any prop → enable **Solid** to stand on it → optional **Jump pad** / **Death zone** → place **Light bulbs** to light the course → Save → Set MAIN → rejoin Deathrun. Walls still won’t block sideways until Phase 2 wall boxes. Don’t trust Play Test alone for gap difficulty.

### “Make sure GAME physics is fully operational and works like any other platformer on market!”

**Not yet fully.** Core pad platforming + jump pads + hazard damage are operational. Market parity still needs wall boxes, variable jump, and prediction. Call it **solid mid-core with authorable pads**, not AAA indie platformer feel.

---

## Part H — Deep-dive addendum (post-audit review)

Extra high-severity findings. Fold into Phase 0–2 tickets.

### H1. Map / multiplayer authenticity

| Finding | Risk | Suggested phase |
|---|---|---|
| `loadCustomMap` is not role-gated — any lobby client can replace platforms | Griefing / overwrite | **Phase 0** |
| MAIN map + overlay meshes live in **publisher’s** `localStorage`; other clients get pads (if pushed) but may miss props/traps/lights | Visual desync | **Phase 0 / 5** |
| Starter empty-map floors reach ~X=16 while finish is hardcoded `FINISH_X ≈ 46` | New maps “impossible” to finish | **Phase 0** |
| Trapper spawn extracted but **never applied** in match (everyone uses runner spawn) | Role imbalance | **Phase 0** |
| `group` entity kind has no place UI; `isAdmin` prop on `MapEditor` unused | Dead surface / weak guards | Phase 3 polish |
| Checkpoints tagged on pads but **no respawn logic** in sim | Misleading kind | Phase 4 |
| Custom map **clears** default timed obstacles | Empty timed deathrun unless editor hazards placed | Phase 4 (partially mitigated by hazard export) |

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
2. Place floors / props; enable **Solid** on anything you want walkable  
3. Place **Start** (spawn) and **Finish** (touch to win)  
4. Optionally enable **Jump pad** / **Death zone**; place **Light bulbs** / Trapper Spawn  
5. Save → **Set as MAIN**  
6. Join Deathrun from **that same browser** while still in lobby/countdown so `loadCustomMap` fires  
7. Treat unmarked walls/stairs as **decor only** until wall boxes land  

Do **not** use Play Test alone to judge gap difficulty.

---

## Part I — 2026-07-20 gameplay authoring update

### Shipped in this pass

| Feature | Where | Notes |
|---|---|---|
| **Solid** toggle on selection | Properties → Gameplay | Exports top-plane pad; `solid: false` overrides floor heuristic |
| **Jump pad** + boost slider | Properties → Gameplay | Platform `kind: 'jumpPad'`, server launches on land/stand |
| **Death zone** authoritative | Existing panel + `mapDocToSimHazards` | Always-active obstacles with per-entity damage / interval / instant kill |
| **Light bulb** entity | Toolbar + kind + light panel | PointLight in editor + match overlay |
| **Start** entity | Toolbar + kind | Runner spawn (`spawn_runner` legacy OK) |
| **Finish** entity | Toolbar + kind | Touch/step → `hasFinished`; required to publish |
| Trapper spawn applied | `DeathrunRoom` | Role-aware spawn from map |
| Dynamic world bounds | `mapDocToWorldBounds` → movement clamp | Big maps no longer stuck in 48×10 |
| Solid / jump gizmos | Editor viewport | Green = solid, cyan = jump, red = hazard |
| Mobile Hide UI (prior PR) | Map editor chrome | Collapse all menus for placing |

### Still missing after this pass (include next)

1. **Vertical wall / box colliders** — Solid does not block walking through walls.  
2. **Server MAIN + map document sync** — other players may not see overlay meshes/lights.  
3. **Play Test = `applyMovement`** + same pads/hazards/finishes.  
4. **Role-gated `loadCustomMap`**.  
5. **Timed / moving traps** from editor (buttons authoritative).  
6. **Checkpoint respawn**.  
7. **Variable jump cut** + prediction.  
8. **Conveyors / ice / teleporters** (nice-to-have).  
9. **Unit tests** for export remaps.  
10. Progress HUD should use Start→Finish distance instead of hardcoded `FINISH_X`.

### Suggested inclusion order

1. Phase 0 security + MAIN cloud sync  
2. Phase 1 play-test parity  
3. Phase 2 wall boxes  
4. Phase 4 timed traps / checkpoints  
5. Phase 3 jump feel + Phase 6 netcode  

---

## Change log

| Date | Note |
|---|---|
| 2026-07-20 | Initial audit from codebase review; no runtime play session logged in this doc. |
| 2026-07-20 | Added Part H deep-dive from follow-up editor + physics audits (security, finish/spawn gaps, jump/net edge cases). |
| 2026-07-20 | Part I: Solid / Jump pad / authoritative hazards / Light bulb shipped; checklist boxes updated; remaining gaps restated. |
| 2026-07-20 | Start + Finish entities, trapper spawn, dynamic world bounds; publish validation requires Start/Finish. |

*Re-run this audit after Phase 0–1 land; update verdicts in the table at the top.*
