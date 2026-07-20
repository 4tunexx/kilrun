# Kilrun Map Editor & Physics Audit

**Date:** 2026-07-20 (updated)  
**Scope:** Admin map editor (`src/components/game/editor/**`), Deathrun match load path (`kilrun-engine` + `DeathrunRoom`), and authoritative platformer sim (`server/src/sim/**`).  
**Audience:** Product / owner — can you easily build map content and does the game feel like a real platformer?

---

## Executive verdicts

| Question | Verdict | One-line answer |
|---|---|---|
| Can I **easily create** maps, place elements/entities, and ship them into play? | **Yes for single-browser staff** | Place floors/props, mark **Solid**, add **Jump pads** / **Death zones** / **Lights** / **Start** / **Finish**, save, set MAIN, rejoin. Cloud MAIN sync across machines still missing. |
| Is **game physics fully operational** like market platformers (Mario / Celeste-class basics)? | **Solid mid-core** | Gravity, coyote + buffer, jump cut, sprint energy, void + checkpoint respawn, jump pads, hazard damage, tall solid wall AABB, Play Test ≈ match step. Still missing slopes, moving platforms, prediction, timed traps. |

**Bottom line:** Authorable Deathrun courses work end-to-end in one browser (editor → MAIN → lobby host/admin load → match). Walls block when Solid + tall; Play Test uses shared pad export + `stepPlatformer`. Remaining product blockers: server MAIN sync, timed/moving traps, netcode prediction.

---

## Part A — Map editor audit

### A1. What works today

- **Full-viewport editor** via portal (`map-editor.tsx`) with free-fly camera, grid snap, layers, selection, ESC hierarchy.
- **Mobile chrome collapse** — Hide UI / Menus, overlay library drawer, collapsible tools + properties, Start/Finish/Props FABs, safe-area properties sheet.
- **Entity kinds:** `prop`, `start`, `finish`, `spawn_runner`, `spawn_trapper`, `checkpoint`, `hazard`, `trap`, `group`, `player`, `button`, **`light`** (`map-document.ts`).
- **Gameplay on selection:** **Solid** collider export, **Jump pad** (+ boost), **Death zone** damage / instant kill, **Light bulb**, **Start** spawn, **Finish** touch-to-win.
- **Large prototype GLB catalog** (`prototype-catalog.ts`) — floors, walls, stairs, doors, buttons, crates, pipes, etc.
- **Custom GLB / texture uploads**, animation director (proximity / interact / collide / signal / always).
- **Prefabs** — stamp selection as prefab, re-instantiate (`prefab-storage.ts`).
- **Validation before publish** — requires Start + Finish + enough solids (`map-validate.ts`).
- **Thumbnails** generated offline (`map-thumbnail.ts`).
- **Play Test** uses `mapDocToSimPlatforms` + `stepPlatformer` (match-like pads, jump cut, walls, finish, checkpoints) + dual joysticks on mobile.
- **MAIN / Active Match Map** — local flag `kilrun.activePlayMapId.v1`; client converts pads + hazards → `loadCustomMap` (host/admin only).
- **Starter floors** / empty-map heal for old docs.
- **Mobile editor controls** — dual sticks + Sprint / Edit / Fly buttons.

### A2. Supported element inventory (practical)

| Kind / feature | Editor | Visual in match | Authoritative collide / kill |
|---|---|---|---|
| Floor / platform props (`*floor*`) | Yes | Often skipped in overlay (server pad instead) | **Yes** (thin top pad) |
| **Start** | Yes | Marker (skipped in match overlay) | Spawn point for runners |
| **Finish** | Yes | Amber pad overlay | **Yes** — touch/step marks finished |
| **Any prop with Solid ✓** | Yes | Mesh overlay | **Yes** — thin top or tall wall box |
| Checkpoint | Yes | Pad kind | Touch saves respawn; void soft-respawns |
| **Jump pad** | Yes (Gameplay panel) | Cyan pad / tint when no mesh | **Yes** — launches with `boost` |
| Walls / columns (Solid) | Yes | Yes (overlay) | **Yes** — side AABB when tall enough |
| Buttons + signal → traps/doors | Yes | Animations via overlay / director | **Client FX**; not full server trap authority |
| Hazards / death zone | Yes | Mesh overlay | **Yes** — exported as always-active damage obstacles |
| **Light bulb** | Yes | Point light + bulb in overlay | Visual only (client) |
| Runner / trapper spawn | Yes | Used as start | Both applied in match |
| Prefab stamps | Yes | As entities | Same as ingredients |
| Default timed deathrun obstacles | N/A | Default course | Cleared when custom map loads (replaced by editor hazards if any) |

### A3. Play path (editor → live game)

```
Editor Save (localStorage JSON)
   → Set Active / MAIN (toast: rejoin lobby/countdown)
   → Join Deathrun (host or isAdmin)
   → kilrun-engine reads getActivePlayMapId()
   → mapDocToSimPlatforms / Hazards / Finishes / WorldBounds / Spawns
   → room.send('loadCustomMap', …)  // role-gated
   → DeathrunRoom replaces platforms + obstacles + bounds
   → CustomMapOverlay draws props / traps / lights on client
```

### A4. Remaining pain points

1. **Storage is browser `localStorage` only** — no cloud MAIN / multi-admin sync.  
2. **Rotation ignored** for pad AABB; scale→size approximate.  
3. **Timed / moving deathrun traps** still not authored as server obstacles.  
4. **No slope / mesh collider baking** — stairs need Solid pads stacked by hand.  
5. **Coordinate remap** editor Y-up Three → sim `(x forward, y lateral, z height)`.

### A5. Map editor verdict (detail)

**Ready for staff map authoring on one device.** Mobile Hide UI + Start/Finish FABs make placement practical. Ship cloud MAIN before multi-staff production.

---

## Part B — Physics / platformer audit

### B1. What the live match already has (good)

Authoritative loop: clients send **intent only** (`input`); server steps at ~30 Hz (`DeathrunRoom` + `applyMovement` in `server/src/sim/movement.ts`).

| Feature | Status | Notes |
|---|---|---|
| Gravity + max fall speed | Yes | `GRAVITY`, `MAX_FALL_SPEED` |
| Jump from ground | Yes | `JUMP_VELOCITY` |
| Variable jump cut | Yes | `JUMP_CUT_MULTIPLIER` on release |
| Coyote time | Yes | `COYOTE_TIME_MS = 90` |
| Jump buffering | Yes | `JUMP_BUFFER_MS = 110`, edge trigger |
| Ground accel / friction | Yes | Quake-inspired |
| Air accel / air control | Yes | Cap via `MAX_AIR_SPEED_MULT` |
| Sprint + stamina | Yes | Energy drain/regen/exhaust |
| Crouch speed | Yes | `CROUCH_SPEED_MULTIPLIER` |
| Platform landing / support | Yes | `findSupportPlatform` AABB top |
| Tall solid wall AABB | Yes | `resolveSolidCollisions` when `height > 0.35` |
| **Jump pads** | Yes | `kind: 'jumpPad'` + `boost` |
| **Editor hazard damage** | Yes | Always-active obstacles |
| Checkpoint soft-respawn | Yes | Void → checkpoint; hazard kill still eliminates |
| Dynamic world bounds | Yes | From map AABB on `loadCustomMap` |
| Void death | Yes | `VOID_Z` (room-handled) |
| Role speed variants | Yes | trapper slightly slower |
| Mobile dual sticks | Yes | Client input mapped into wishdir |

### B2. Missing vs market platformers

| Feature | Status | Impact |
|---|---|---|
| Apex hang / Celeste-style control | Partial | Air control exists; no dedicated apex |
| Wall jump / slide | Missing | Walls block; no climb/jump off |
| Slopes / stairs as surfaces | Missing | Stairs not collider-mesh |
| Moving platforms (kinematic carry) | Missing | |
| One-way / drop-through platforms | Limited | Tops only; drop-through not authored |
| Edge forgiveness / corner correction | Weak | Skin width helps; snags possible |
| Client prediction + reconciliation | Weak / none visible | 30 Hz authority feels laggy on high ping |

### B3. Physics verdict (detail)

**Solid mid-core.** Pad platforming + wall boxes + jump cut + jump pads + hazards + checkpoints are operational. Market polish still needs prediction, slopes, and moving platforms.

---

## Part C — Cross-cutting risks

1. **Two map truths** — local MAIN vs shared multiplayer expectation (overlay meshes need publisher’s browser).  
2. **Scale/rotation approx** — visual GLB vs AABB pads.  
3. **Obstacle identity gap** — classic timed bars cleared on custom load; static editor hazards fill part of the gap; moving traps still missing.

---

## Part D — Phased improvement roadmap

### Phase 0 — Stabilize what’s shipped

**Goal:** Stop silent footguns so MAIN maps actually play.

- [x] Raise / dynamic world bounds from map AABB when loading custom platforms.  
- [ ] Persist **Active MAIN map id + document** on **server/SiteSettings** (not only localStorage).  
- [x] ~~Warn in editor UI: “Only floor*/checkpoint collide.”~~ → **Replaced** by explicit Solid / Jump pad / Death zone controls + green/cyan pad gizmos.  
- [x] After Set MAIN, toast: “Rejoin match to reload platforms.”  
- [x] Unit tests: `mapDocToSimPlatforms` / `mapDocToSimHazards` axes + spawn remap.  
- [x] Finish detection via editor **Finish** entity (touch/step); falls back to `FINISH_X` when none.  
- [x] Role-gate `loadCustomMap` (admin / lobby host only).  
- [x] Apply trapper spawn from map doc in match.  
- [x] **Start** entity as player spawn (legacy `spawn_runner` still accepted).

**Exit:** A documented solid/jump-pad map plays for any joining client after staff publishes MAIN once. *(Blocked only on cloud MAIN sync for non-publisher clients’ overlay meshes.)*

---

### Phase 1 — Editor ↔ match parity

**Goal:** Play Test uses **the same** `applyMovement` + platforms as the room.

- [x] Compile platforms in play-test from `mapDocToSimPlatforms`.  
- [x] Run local headless tick of shared step (`stepPlatformer` / `src/lib/platformer-sim.ts`) in preview.  
- [ ] Show collision pads as debug overlays (toggle) — editor already shows solid/jump gizmos; match needs toggle.  
- [ ] Sync jump/gravity constants UI ↔ `server/src/sim/constants.ts` (constants duplicated in `platformer-sim.ts` — keep in sync manually for now).  
- [x] Hazard touch damage authoritative (editor hazards → always-active obstacles on `loadCustomMap`).

**Exit:** If you clear Play Test, you clear a live match on the same map. *(Largely met; constant drift risk remains.)*

---

### Phase 2 — Collision fidelity

**Goal:** Geometry creators can trust walls and stacked floors.

- [x] Explicit solid authoring on entities (`solid` boolean + jumpPad) — no longer floors-only heuristic (heuristic kept as default for `floor*` / checkpoint).  
- [x] Bake **vertical wall boxes** (axis-aligned push-out), not only top pads.  
- [ ] Collider mode enum refinement: `'box' | 'none' | 'top'` if needed for author control.  
- [ ] Optional stair ≈ stepped pads auto-generator.  
- [ ] Corner correction / skin width polish (`COLLISION_SKIN` present).  
- [x] Visual gizmo: green = solid pad, cyan = jump pad, red = hazard (editor).

**Exit:** A corridor with walls contains the player; stairs are climbable without 20 hand pads. *(Walls yes; stairs still manual.)*

---

### Phase 3 — Market jump feel

**Goal:** Jump readability like Mario / modern indies.

- [x] Variable jump cut (release → multiply `vz` if ascending).  
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
- [x] Checkpoints with respawn (touch + void soft-respawn).  
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

---

### Phase 7 — Nice-to-haves / addons (ongoing)

- [x] Point lights as placeable entities (client visual).  
- [ ] Conveyors / ice / teleporters.  
- [ ] Replay / ghost WR.  
- [ ] In-editor measure tool.

---

## Part H — High-severity findings (status)

| Finding | Severity | Status |
|---|---|---|
| `loadCustomMap` not role-gated | Griefing | **Fixed** — host / `isAdmin` |
| MAIN + overlay in publisher localStorage | Visual desync | Still open (Phase 5) |
| Starter floors vs hardcoded finish | Impossible course | **Fixed** — Finish entity + dynamic HUD |
| Trapper spawn unused | Role imbalance | **Fixed** |
| Checkpoints no respawn | Misleading | **Fixed** — void soft-respawn |
| No jump cut | Fixed-height | **Fixed** |
| No side AABB | Walk through walls | **Fixed** for tall solids |
| Play Test ≠ match | Creator lies | **Fixed** — shared step + pads |
| Progress HUD hardcoded `FINISH_X` | Wrong % | **Fixed** — `courseStartX` / `courseFinishX` |

---

## Part I — 2026-07-20 gameplay authoring update

### Shipped in this pass

| Feature | Where | Notes |
|---|---|---|
| **Solid** toggle on selection | Properties → Gameplay | Thin floors + tall wall boxes |
| **Jump pad** + boost slider | Properties → Gameplay | Platform `kind: 'jumpPad'` |
| **Death zone** authoritative | `mapDocToSimHazards` | Always-active obstacles |
| **Light bulb** entity | Toolbar + kind | PointLight in editor + overlay |
| **Start** / **Finish** | Toolbar + kind | Spawn + touch-to-win; required to publish |
| Trapper spawn applied | `DeathrunRoom` | Role-aware spawn |
| Dynamic world bounds | `mapDocToWorldBounds` | Big maps clamp correctly |
| Wall AABB + platform height | `resolveSolidCollisions` | Tall solids block sideways |
| Variable jump cut | `movement.ts` / `platformer-sim` | Release shortens jump |
| Checkpoint soft-respawn | Room + Play Test | Void → last checkpoint |
| Role-gate `loadCustomMap` | Host / admin | Lobby passes `isAdmin` |
| Play Test match physics | `platformer-sim.ts` | Pads, walls, finish, jump cut |
| Progress HUD Start→Finish | `courseStartX/FinishX` | Custom-map aware |
| MAIN toast (not alert) | `useToast` | Rejoin reminder |
| Unit tests | `prefab-storage.test.ts` | 5 cases |
| Mobile FABs | Start / Finish / Props / Avatar | Collapsed + visible chrome |
| **Player Model studio** | Toolbar + side panel | Live preview, clip bind (walk/jump/die…), GLB upload; drives Play Test + match |
| **Timed / button traps** | Hazard panel Mode | always / timed pulse / button-armed; spike/saw/laser kinds |
| **Authoritative buttons** | Button → Activates | Press E near button arms linked traps in match |
| **Ice / conveyor** | Gameplay panel | Slippery pads + push along facing |
| **Teleporters** | Gameplay panel | Link A→B pads; touch to warp |
| **Stair baker** | Stairs selection | Bake stairs → solid step pads |

### Still missing (next)

1. **Server MAIN + map document sync** — other clients may miss overlay meshes/lights / custom avatars.  
2. **Moving platforms** (kinematic path).  
3. **Client prediction**.  
4. Shared constants package (avoid drift between server + `platformer-sim.ts`).

### Suggested inclusion order

1. Phase 5 cloud MAIN sync  
2. Moving platforms  
3. Phase 6 prediction  

---

## Staff workflow (current)

1. Admin → Map Editor  
2. Open **Player Model** — pick mannequin/upload GLB, bind walk/jump/die, preview  
3. Place **Start** + floors/solids + hazards/jump pads + **Finish**  
4. Add **timed traps** / **button-armed** kill floors; wire Button → Activates trap  
5. Optional: ice, conveyor, teleporters; bake stairs for climbable collision  
6. On mobile: **Hide UI**, place with FABs, tap **Avatar** / **Props**  
7. **Play Test** to verify gaps/finish/anims (match-like physics)  
8. Save → **Set as MAIN** (toast)  
9. Join Deathrun from **that same browser** while still in lobby/countdown so `loadCustomMap` fires  
10. Mark walls **Solid** so corridors contain players  

---

## Change log

| Date | Note |
|---|---|
| 2026-07-20 | Initial audit from codebase review; no runtime play session logged in this doc. |
| 2026-07-20 | Added Part H deep-dive from follow-up editor + physics audits (security, finish/spawn gaps, jump/net edge cases). |
| 2026-07-20 | Part I: Solid / Jump pad / authoritative hazards / Light bulb shipped; checklist boxes updated; remaining gaps restated. |
| 2026-07-20 | Start + Finish entities, trapper spawn, dynamic world bounds; publish validation requires Start/Finish. |
| 2026-07-20 | Wall boxes, jump cut, checkpoints, play-test parity, role-gate, HUD anchors, unit tests, mobile FABs; audit checklist refreshed. |
| 2026-07-20 | Player Model studio: side panel, die/land slots, match/Play Test honor map avatar bindings. |
| 2026-07-20 | Timed traps, button-armed hazards, ice/conveyor, teleporters, stair baker — dream-map deathrun loop. |
| 2026-07-20 | Model Editor skins/weapons — see [`MODEL_EDITOR_AND_SKINS.md`](./MODEL_EDITOR_AND_SKINS.md). |

*Re-run this audit after cloud MAIN sync lands.*
