# Model Editor, Skins & Weapons

**Updated:** 2026-07-25  
**Audience:** staff / contributors shipping cosmetics and combat visuals  
**Related:** [`ANIMATIONS_MIXAMO_AND_COMBAT.md`](./ANIMATIONS_MIXAMO_AND_COMBAT.md) (Mixamo, pack anims, attack clips), [`MAP_EDITOR_AND_PHYSICS_AUDIT.md`](./MAP_EDITOR_AND_PHYSICS_AUDIT.md), [`../server/README.md`](../server/README.md)

---

## Pack character (Characters_7)

Default player is **Body_Blue_001** from `public/game/skins/` (not the old Kenney mannequin).

| Asset | Path |
|---|---|
| Meshes / textures | `public/game/skins/**` |
| Pack animations | `public/game/skins/anim/pack-anims.json` |
| Optional Unity source | local `model_skins/` (gitignored) — reseed with `npm run db:seed-assets` |

Full-body skins **replace** the base mesh (you will not see Blue 001 underneath). Body colors (Brown, …) replace the mesh but still allow layered hair/hat/hoodie. Equip clash rules live in `src/lib/skin-equip-rules.ts`.

For Mixamo / extra attack clips / weapon swing binding, see **[`ANIMATIONS_MIXAMO_AND_COMBAT.md`](./ANIMATIONS_MIXAMO_AND_COMBAT.md)**.

---

## What this system is

The **Model Editor** authors **player skins** (hat, face, torso, pants, boots, gloves, weapon, back, tail, horn, custom parts). Skins are meshes + materials placed on the avatar. They can be:

1. Applied to the map **Player** entity (Play Test / match map avatar)
2. Published to the **shop** (`Skins` category) → purchase → equip → show on your match avatar

Weapons are a skin slot **plus** combat metadata (melee / hitscan / look-only). The mesh sits on the **hand bone**; the **character Attack/Punch clip** does the swing.

---

## Pipeline (end-to-end)

```
Model Editor (sculpt / catalog / upload GLB)
   → Save preset (localStorage) + Apply to map player entity (playerSkins)
   → Publish to shop (cosmeticConfig = player_skin JSON + thumbnail)
   → Player buys / equips (User.equippedSkins[skin_*] = cosmeticConfig)
   → Lobby loads getMyEquippedSkinAttachments()
   → KilrunEngine → ThreeCharacter({ avatarEntity, equippedSkins })
   → applySkinAttachments(scene, mapSkins ∪ equippedSkins)
```

| Stage | Where data lives | Who sees it |
|---|---|---|
| Authoring | Browser `localStorage` presets + map `playerSkins` | Editor / Play Test |
| Shop listing | `StoreItem.cosmeticConfig` + image | Shop / admin |
| Owned / equipped | `InventoryItem` + `User.equippedSkins` | Profile / match (local) |
| Match render | Client `ThreeCharacter` | Local player shop skins + map skins |

---

## Model Editor features (shipped)

| Feature | How to use |
|---|---|
| **On body / Skin only** | Hide avatar to sculpt just the hat/part |
| **Sculpt / Turn** | Paint clay vs orbit camera |
| **Front / Side / Bottom / Top / Back** | Quick camera angles |
| **Clay view** | Matcap-style shading while sculpting |
| **Fullscreen sculpt** | Full button — Skin only + Sculpt; paint works on the part |
| **Primitives + shape + Fit size** | Squish/expand cylinders, etc. |
| **Insert & bond shapes** | Add spheres/boxes/cones onto a skin, then sculpt each piece |
| **Blob Add / Remove / Smooth** | ZBrush-lite clay; Symmetry L/R; Undo/Redo |
| **Solid / Cloth / Cape** | Material feel (+ light sway for cloth/cape) |
| **Lock on body / Follow bone** | Exact place vs stick to skeleton (optional bone picker) |
| **Pair L/R** | Gloves / boots / horns mirror |
| **Tail / Horn / Custom part** | Extra body attachments |
| **Weapon combat panel** | Melee / Hitscan / Look only + range / cooldown |
| **Shop thumbnail** | Live render of **the part** (not full avatar); no 3D shop inspect |

### Player Model studio

| Feature | How to use |
|---|---|
| **Mesh tab** | Recolor body meshes; Round+ / Squeeze / axis sliders on selected bone |
| **Bones tab** | Select skeleton bones; +/- helper bones |
| **Record tab** | Select bone → Record → move gizmo → Add to timeline → Save clip (keys only that bone) |
| **Anims tab** | Bind / preview clips including recorded ones |

---

## Weapons — recommended approach

**Do this:** static or sculpted weapon mesh on the right hand + character **Attack** / **Punch** animation.

**Avoid (for now):** fully animated weapon GLBs as the primary combat animation path (second mixer, retargeting, little gameplay gain — combat is still an aim cone).

### Authoring steps

1. Model Editor → **Weapon** → sculpt / `weapon-sword` / upload GLB  
2. **On body** + **Follow bone** → Offset into the hand  
3. Combat: **Melee** or **Hitscan** (range / cooldown matter in Play Test)  
4. Player Model studio → bind **Attack** / **Punch** clips if the avatar GLB has them  
5. Play Test / match → Attack button plays the swing; weapon rides the hand  

### Physics / combat today

| Layer | Behavior |
|---|---|
| **Visual** | Weapon mesh parented to hand (or body-locked) |
| **Play Test** | Uses skin range/cooldown for swing reach + attack anim |
| **Live match (trapper)** | Server hitscan still uses fixed `HITSCAN_RANGE` / `HITSCAN_DAMAGE` |
| **Damage slider on skin** | **Saved for later** — not yet authoritative on the Colyseus server |

---

## Placement contract

- Positions are **character-local** (feet at `y = 0`).  
- **Lock on body** → same Offset in editor and gameplay.  
- **Follow bone** → Offset converted to bone-local at attach time so hats/weapons follow animation.  
- Clearing skins removes both `__skin_attachments` and any `skin_*` holders left on bones (avoids duplicate stacking in the editor).

---

## Key files

| Path | Role |
|---|---|
| `src/lib/player-skins.ts` | Slots, attachments, parse/flatten equipped skins |
| `src/lib/weapons.ts` | Weapon combat kinds + defaults |
| `src/components/game/editor/model-skin-editor.tsx` | Model Editor UI + preview |
| `src/components/game/editor/skin-attachments.ts` | Build / attach / clear / sway |
| `src/components/game/editor/skin-sculpt.ts` | Blob brushes |
| `src/components/game/editor/skin-library.ts` | Local presets + shop payload |
| `src/components/game/entities/three-character.ts` | Match avatar + skins + attack anim |
| `src/components/game/editor/map-play-preview.tsx` | Play Test |
| `src/components/views/lobby-view.tsx` | Loads equipped skins before match |
| `src/lib/social-actions.ts` | Equip + `getMyEquippedSkinAttachments` |

---

## Later stages (not done yet)

These are intentional follow-ups — do not assume they work in production yet.

### 1. Signed loadouts from DB (anti-spoof)
- Join currently sends client-packed skins/weapon with server clamps  
- Stronger: issue HMAC-signed loadout from `User.equippedSkins` at matchmaking  

### 2. Animated weapon-only clips (optional polish)
- Idle fidget / reload / sheathe on the weapon mesh only  
- Still keep character Attack as the combat motion  

### 3. Melee damage in Play Test / PvP polish
- Play Test has no other players; damage slider is metadata for Horde / Competitive  

### 4. Prisma / schema
- After deploy: Admin **Sync database schema** so `GameMap` + `equippedSkins` exist on Mongo  

---

## Shipped recently (PR upgrades)

| Upgrade | Behavior |
|---|---|
| Remote equipped skins | Join sends `equippedSkinsJson`; remotes render peers' shop skins |
| Server weapon combat | Per-player clamped `weaponRange` / `damage` / `cooldown` / cone |
| Cloud Active maps | Admin Active publishes `GameMap`; matches prefer cloud over localStorage |
| No empty skins | Cosmetics Studio → Skins creates primitives; slot-only create blocked |

## Quick smoke test

1. Open Map Editor → Model Editor → sculpt a hat → **Skin only** → Turn under brim → Save  
2. Apply to player → Play Test → hat visible  
3. Weapon slot → Follow bone → Melee → Attack anim in Play Test  
4. Publish to shop → buy/equip → join Deathrun → local avatar shows equipped skins  
5. Tail / Cloth cape → slight sway in play  

---

## Anti-patterns

- Creating a Skins shop item with only a slot name and no `cosmeticConfig` attachments  
- Expecting weapon mesh collision to deal damage (combat is cone / hitscan)  
- Relying on a second animated weapon rig instead of character Attack clips  
- Assuming remotes see your shop skins before server sync ships  
