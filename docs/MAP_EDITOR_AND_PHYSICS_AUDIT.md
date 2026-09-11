# Kilrun Map Editor & Physics Audit

**Date:** 2026-09-11  
**Scope:** Admin / desktop map editor (`src/components/game/editor/**`), live match load path (`kilrun-engine` + Colyseus rooms), and the shared platformer sim (`shared/sim-core.ts`).  
**Audience:** Product / staff — can you build maps, and does Play Test match a live game?

The July 2026 version of this file listed moving platforms, client prediction, cloud MAIN, wall-jump, slopes, and timed traps as missing. **Those systems shipped.** This rewrite matches the code.

---

## Executive verdicts

| Question | Verdict | One-line answer |
|---|---|---|
| Can I **easily create** maps and ship them into play? | **Yes, including a second machine if you publish** | Place solids / jump pads / hazards / lights / Start / Finish, Play Test, Save, Set MAIN (local + cloud publish). Other clients see overlay meshes after cloud hydrate. |
| Is **game physics** operational like a mid-core platformer? | **Yes for authored pads** | Shared `stepSim`: gravity, coyote, jump cut, sprint, slide, flip, double jump, fall damage, wall-jump/slide, analytic slopes, rotated OBB, moving-platform carry, ice / conveyor / teleporters / doors / Solid FX. Collision is pads (voxel-baked), not raw GLB triangles. |

**Bottom line:** Editor → Play Test → Set MAIN → live match is the real loop. Physics is one core (`shared/sim-core.ts`) used by the server, Play Test, and client prediction. Remaining holes that need something outside this repo: triangle-mesh collision (still pads), a purchased code-signing cert, Playwright/Tauri E2E infra, and a live join on a second PC.

---

## Staff smoke checklist (editor → live)

Do this after any engine / sim / publish change:

1. Open **Kilrun Engine** (or Admin → Map Editor).
2. New Deathrun map: place **Start**, a **Solid** floor, a **Finish**. Optional: jump pad, timed trap, moving pad, wall-jump corridor.
3. **Play Test** (offline). Confirm jump cut, walls, finish, checkpoints.
4. **Save** → **Set as MAIN** / Push to live. Toast should say rejoin.
5. Join **Deathrun** from a second browser (or after cloud pull on another PC). Overlay meshes + pads must match Play Test.
6. Repeat a short pass for **Horde** (monster spawn + health floor) and **Competitive** (team spawns).

Exit: if you clear Play Test, you clear the same map live. Constant drift should be impossible because both sides call `stepSim`.

---

## What is shipped

### Physics (`shared/sim-core.ts` + adapters)

| Feature | Status | Notes |
|---|---|---|
| Gravity, max fall, jump, jump cut | Live | `JUMP_CUT_MULTIPLIER` on release |
| Coyote + jump buffer | Live | 90 ms / 110 ms |
| Sprint energy, crouch, slide, flip, double jump | Live | Combat settings can tune several |
| Fall damage | Live | Speed + time thresholds |
| Wall jump / wall slide | Live | Map combat toggle `wallJumpEnabled` |
| Analytic slopes + rotated OBB | Live | `slopeGradX/Y`, `rotYaw` |
| Tall solid side collision | Live | Not top-only when height is enough |
| Moving platforms + carry | Live | `shared/moving-platform.ts`; client predicts from match clock |
| Ice / conveyor / water / sand | Live | Pad kinds |
| Teleporters, doors, buttons | Live | Authoritative on the room |
| Timed / button-armed hazards | Live | Pulse + E-near-button arm |
| Solid FX vanish / unveil | Live | Shared `solid-fx` |
| Client prediction + soft reconcile | Live | Movement only; `src/lib/client-prediction.ts` |
| Play Test = match step | Live | `src/lib/platformer-sim.ts` → `stepSim` |

### Editor / content

- Entity kinds: prop, start/finish/checkpoint, hazard/trap/spinner, button/door/light/jump_pad, player, Horde (monster spawn, red zone, revive, health floor, wave anchor), Competitive (team spawns, push rail/block).
- Hammer solids, CSG, mesh voxelize / stair bake, prefabs, layers, outliner, animation director.
- Model / skin / weapon / power / sound / TPS studios (plugin rail).
- Cloud hydrate + publish MAIN (`hydrateCloudMapsIntoLocal`, Engine home pull). LocalStorage + disk still exist; **cloud wins when newer**.
- Play Test offline (`MapPlayPreview`) and live practice rooms (`play-test-engine.tsx`). Live practice needs a real Engine session token; the desktop stub token is offline-only.

### Play path (current)

```
Editor Save (localStorage and/or Documents/Kilrun/Projects)
   → Set MAIN / publish GameMap (cloud)
   → Other devices: hydrateCloudMapsIntoLocal
   → Join match (host or isAdmin loadCustomMap)
   → mapDocToSim* → room replaces platforms / obstacles / bounds
   → Client predicts with the same pads + match clock
   → CustomMapOverlay draws props / lights / traps
```

---

## Remaining pain points (still true)

1. **Collision is pads, not raw triangles.** Voxel bake + AABB/OBB. Amber COL gizmos + BAKE flag solids that still need a mesh bake; physics never walks GLB triangles.
2. **Two map truths if you skip publish.** Local can be newer than cloud; other machines miss overlay meshes.
3. **Combat / ability prediction is feel-only.** Hitscan uses `shared/hitscan.ts`; ability cues use `canActivateAbility` (same deny rules as the server). Damage, traps, and the actual buff still stay server-authoritative.
4. **Horde AI is pad-graph A\*, not a navmesh.** Authored solids become walkable pads; no recast/detour mesh.
5. **Server plugins prefer a worker isolate.** Fallback is in-process `vm`. Admin-only `server` permission is still the real gate.
6. **Desktop installer is unsigned.** No silent native auto-updater yet (in-app download + module hot-update work). Needs a purchased code-signing cert.
7. **Coordinate remap** remains: editor Y-up Three.js → sim `(x forward, y lateral, z height)`.
8. **No Playwright / Tauri E2E yet.** Coverage is Vitest (+ optional `npm run engine:test` Cargo). Live Editor → Play Test → Set MAIN → second-PC join is still a staff smoke, not CI.
9. **Properties inspector is still in `map-editor.tsx`.** Chrome (top bar, toolstrip, dialogs, COL) is extracted; the 2k-line Properties form is the last studio split.

---

## High-severity history (do not reintroduce)

| Finding | Status |
|---|---|
| `loadCustomMap` not role-gated | **Fixed** — host / `isAdmin` |
| Starter floors vs hardcoded finish | **Fixed** — Finish entity + HUD anchors |
| Trapper spawn unused | **Fixed** |
| Checkpoints no respawn | **Fixed** |
| No jump cut / no side AABB | **Fixed** |
| Play Test ≠ match | **Fixed** — shared `stepSim` |
| Cloud MAIN missing | **Fixed** as publish + hydrate (skip-publish still desyncs) |
| Grouped solids fly apart on rotate | **Fixed** + regression test |
| Invisible solid / phantom prefab collision | **Fixed** + regression tests |
| Gizmo NaN explode | Guard + regression test — keep covered |

---

## Suggested inclusion order (from here)

1. Surface plugin / IPC / catalog errors; production `devtools` off.
2. Mesh-collider trust gizmos + Horde nav on authored pads.
3. Ghost WR as a first-class Play Test tool; HMAC-signed match loadouts.
4. Isolate server plugins; studio split / stub honesty / version lockstep.

---

## Staff workflow

1. Engine or Admin → Map Editor.
2. Player Model / skins if needed.
3. Place Start + solids + hazards / jump pads + Finish. Optional: timed traps, buttons, ice, conveyor, teleporters, moving pads, stair bake.
4. Play Test. Then Save → Set MAIN / Push to live.
5. Join the mode from any signed-in client after cloud publish (not only the authoring browser).
6. Mark walls **Solid**. Bake stairs. Enable wall-jump in Combat if the course needs it.

*Re-run this smoke list after sim-core, publish, or plugin-runtime changes.*
