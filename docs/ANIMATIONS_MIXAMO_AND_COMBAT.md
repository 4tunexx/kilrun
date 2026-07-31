# Animations (Pack / Mixamo) & Weapons Combat

**Updated:** 2026-07-25  
**Audience:** you (future you) adding locomotion, attack, or Mixamo clips  
**Related:** [`MODEL_EDITOR_AND_SKINS.md`](./MODEL_EDITOR_AND_SKINS.md), Weapon Editor / Combat Editor in Map Editor

---

## TL;DR

| Goal | What to do |
|---|---|
| Ship the current Characters_7 pack | Already done — meshes in `public/game/skins/`, clips in `public/game/skins/anim/pack-anims.json` |
| Add **more Unity `.anim` clips** from the same pack | Drop `.anim` into local `model_skins/` → `node scripts/convert-unity-anims.js` → bind slots in Player Model studio |
| Add **Mixamo** animations | Export FBX (same bone names / Y-up) → convert or retarget onto pack `DEF-*` skeleton → merge into pack anims **or** attach as extra clips on the avatar → bind slots |
| Add a **weapon** | Model Editor → weapon slot → Follow bone (hand) → combat kind → character **Attack** / **Punch** clip does the swing |
| Tune Unity→three twist | Dev only: `/anim-test` Untangle Studio (production default is `flipX` + skip position/scale) |

Runtime never reads `model_skins/`. That folder is an optional **local source** (gitignored). The game loads `/game/skins/...`.

---

## How player animation works today

```
Body_Blue_001.fbx (or Body_* / FullBody_*)
   + pack-anims.json  →  THREE.AnimationClip[] on DEF-* bones
   → AnimationMixer on the avatar
   → playerAnims bindings map gameplay slots → clip names
   → ThreeCharacter / Play Test picks idle/run/attack/…
```

### Gameplay slots (`PlayerAnimSlot`)

Defined in `src/components/game/editor/map-document.ts` → `PLAYER_ANIM_SLOTS`:

| Slot | Used when |
|---|---|
| `idle` | Standing |
| `walk` / `run` | Move / sprint |
| `jump` / `fall` / `land` | Airborne |
| `crouch` | Crouch held |
| `strafe_left` / `strafe_right` / `back` | Strafe / reverse |
| `attack` | Weapon swing / shoot pose |
| `punch` | Unarmed fallback |
| `die` | Eliminated |

`suggestPlayerBindings(clipNames)` fuzzy-matches names (`run`, `Attack_heavy…`, `Idle`, …). You can override per map in **Player Model studio → Anims**.

### Production conversion knobs

`src/lib/unity-anim.ts` + `pack-player.ts`:

- **Mode:** `flipX` (Unity LH → three RH quat component flip)
- **Skip position tracks** (Unity near-zero positions collapse the spine in FBX bind space)
- **Skip scale tracks**

Do **not** “rebase onto FBX bind” — that path was wrong for this pack. Dial experiments in `/anim-test`, then hardcode the winner in `DEFAULT_CONV_MODE` / `pack-player.ts`.

---

## Pipeline A — more clips from the Characters_7 Unity pack

1. Keep a local `model_skins/` with the original `.anim` files (and FBX/PNG if you need to reseed meshes).
2. Add or replace `.anim` files (same Rigify `DEF-*` paths as existing clips).
3. Regenerate JSON:

```bash
node scripts/convert-unity-anims.js
```

   Output: `public/game/skins/anim/pack-anims.json`

4. Optional mesh/shop refresh:

```bash
npm run db:seed-assets
```

5. Open Map Editor → Player Model studio → **Auto-bind** or set Attack/Run/Idle manually.
6. Smoke-test in Play Test and `/anim-test` (dev).

---

## Pipeline B — Mixamo (extra animations)

Mixamo clips are **not** Unity `.anim` files. They are usually FBX with a Mixamo/Humanoid hierarchy. Our pack player uses **Rigify `DEF-*` bone names**. You must get Mixamo motion onto that skeleton.

### Recommended path (practical)

1. **Pick a target mesh that matches the pack skeleton**  
   Use `Body_Blue_001.fbx` (or any pack body) as the character you animate *for*.  
   Ideal: retarget Mixamo → that FBX in Blender / Unity / Cascadeur so exported tracks use `DEF-spine`, `DEF-upper_arm.L`, etc.

2. **Export**
   - Format: FBX or glTF with **baked animation**
   - Space: Y-up
   - Prefer **bones only** (no mesh morphs required)
   - One clip per file, clear names: `Run_Forward`, `Sword_Slash`, `Idle_Combat`

3. **Get clips into the game** (pick one):

   **Option 1 — Merge into pack JSON (best for locomotion/attack used everywhere)**  
   - Write a small converter (similar to `convert-unity-anims.js`) that samples each Mixamo/retargeted FBX track into the same JSON shape as `pack-anims.json` (`rotation` / `position` / `scale` keyed by leaf bone name).  
   - Or export Unity `.anim` from a Unity project that already retargeted onto the Characters_7 rig, then re-run `convert-unity-anims.js`.  
   - Keep using `flipX` + skip position unless Untangle Studio says otherwise.

   **Option 2 — Per-avatar authored clips (map-specific)**  
   - Player Model studio **Record** tab can author bone keyframes.  
   - Fine for one-off dances; awkward for dozens of Mixamo files.

   **Option 3 — Extra AnimationClips on the loaded FBX**  
   - If Mixamo FBX already shares bone names after retarget, load it with `FBXLoader`, take `gltf.animations` / `fbx.animations`, append to the pack clip list before `suggestPlayerBindings`.  
   - Only works when bone names match `DEF-*` exactly.

4. **Bind** the new clip names to slots (`attack`, `run`, …) in Player Model studio.

5. **Verify** under skins (full-body + layered outerwear) — skinned cosmetics rebind to the player skeleton; bad bone names = stiff clothes.

### Mixamo pitfalls (read before you waste an evening)

| Pitfall | Fix |
|---|---|
| Mixamo `mixamorig:Hips` ≠ `DEF-hips` | Retarget first; do not raw-play Mixamo on pack mesh |
| Root motion / hip translation | Prefer in-place; or strip position tracks like pack anims |
| Left/right mirrored | Check in `/anim-test`; may need quat flip preset |
| Scale 100× | Normalize / fit to 1.75m like `fitAvatarLikeEditor` |
| Finger-less Mixamo | Hands may look stiff; optional finger idle later |
| Second skeleton on clothes | Never attach a second full armature — `applySkinAttachments` rebinds to player bones |

### Minimal checklist for “I downloaded a Mixamo sword slash”

1. Retarget to pack Blue_001 (Blender Bone Retarget / Unity Humanoid → Characters_7).  
2. Export clip named e.g. `Attack_Sword_Mixamo`.  
3. Convert into `pack-anims.json` **or** load beside pack clips.  
4. Player studio → **Attack** slot → that name.  
5. Weapon mesh Follow bone → hand; combat Melee; Play Test Attack.

---

## Weapons & combat (how it fits animations)

### Design (keep this)

**Static weapon mesh on the hand + character Attack/Punch clip.**  
Combat hit detection is a **cone / hitscan**, not mesh collision.

| Layer | Where | Notes |
|---|---|---|
| Mesh + offset | Model Editor → `weapon` slot, Follow bone | Rides `DEF-hand.R` (or hints) |
| Combat stats | `weapon` on attachment / Weapon Editor | `melee` / `hitscan` / `cosmetic` |
| Swing visual | `playerAnims.attack` or `.punch` | Mixer plays clip; weapon follows bone |
| Play Test | `map-play-preview.tsx` | Uses range/cooldown for reach + anim |
| Live match | Colyseus rooms + client | Server clamps range/damage/cooldown; client plays attack anim |

Key files:

- `src/lib/weapons.ts` — kinds + defaults  
- `src/components/game/editor/weapon-editor.tsx` — map-level weapon def  
- `src/components/game/editor/combat-editor.tsx` — map combat/physics  
- `src/components/game/entities/three-character.ts` — `playAttack()` visual  
- `docs/MODEL_EDITOR_AND_SKINS.md` — authoring steps  

### Adding a new combat animation style

1. Add/bind a clip to `attack` (or `punch`).  
2. In weapon combat config set `attackStyle: 'attack' | 'punch'`.  
3. Optional: add a new `PlayerAnimSlot` (e.g. `reload`) in `map-document.ts`, wire director + input — only if gameplay needs it.

### What not to do (yet)

- Fully animated weapon GLBs as the main swing (second mixer / retarget hell).  
- Expecting the blade mesh to deal damage by colliding.  
- Assuming Mixamo “in place” root motion drives player movement (locomotion is code-driven).

---

## Skins vs animations (quick reminder)

| Skin type | Body mesh | Layers (hair/hat/hoodie) | Animations |
|---|---|---|---|
| Default Blue_001 | Pack body | Yes | Pack clips on DEF-* |
| Body_* (Brown, …) | Replaces base | Yes | Same clips |
| FullBody_* | Replaces entire avatar | **No** — exclusive | Same clips if same rig |

Equip clash rules: `src/lib/skin-equip-rules.ts` (full-body exclusive; helmet vs glasses/hair; hat vs hair).

---

## Folder map

| Path | Role |
|---|---|
| `public/game/skins/` | **Shipped** FBX + PNG + `manifest.json` + `anim/pack-anims.json` |
| `model_skins/` | **Local only** (gitignored) Unity source for reseed/convert |
| `scripts/convert-unity-anims.js` | `.anim` → `pack-anims.json` |
| `scripts/seed-asset-registry.ts` | `npm run db:seed-assets` |
| `src/lib/unity-anim.ts` | JSON → `THREE.AnimationClip` |
| `src/components/game/renderer/pack-player.ts` | Default player load + clip build |
| `src/app/anim-test/` | Untangle Studio (dev) |
| `src/lib/skin-equip-rules.ts` | Shop equip exclusivity |

---

## Pipeline C — Mixamo importer UI (Player Model studio → Import tab)

Ships a "get it in and try it" path that automates the tedious part of
Pipeline B (Option 3 / manual bone matching) without requiring Blender:

1. Player Model studio → **Import** tab → upload the Mixamo FBX (or a GLB
   with baked animation).
2. If the file has multiple clips, pick one from the dropdown.
3. Bone mapping is auto-filled by matching standard Mixamo bone names
   (`mixamorig:LeftArm`, …) against this avatar's actual rig bones — review/
   correct any row before saving; `— skip —` drops that bone's tracks.
4. **Preview** plays the retargeted clip live on the avatar in the studio
   viewport before you commit to it.
5. **Save clip to avatar** stores it as a `playerAuthoredClip` (same storage
   as the Record tab) and adds its name to the Anims tab's slot dropdowns —
   bind it to `attack`, `run`, etc. like any other clip.

**What this is not:** a full bind-pose / bone-roll retarget. It renames
track targets (`mixamorig:LeftArm.quaternion` → `DEF-upper_arm.L.quaternion`)
and plays the raw keyframes on the new skeleton — no IK-based correction for
differences in rest pose or bone orientation between the Mixamo rig and this
pack's Rigify `DEF-*` rig. Simple locomotion (walk/run/idle) usually previews
fine; combat/pose-heavy clips can come out twisted at elbows/shoulders and
still benefit from the Blender/Cascadeur retarget in Pipeline B. Always
**Preview** before **Save** — if a joint looks wrong, retarget properly
first rather than shipping a broken clip.

Implementation: `src/components/game/editor/mixamo-import.ts` (bone-name
table + track retarget, unit tested) and the Import tab in
`player-model-studio.tsx`.

---

## Future wishlist (not built)

1. ~~First-class Mixamo importer UI (upload FBX → preview retarget → append clip).~~ **Built** — see Pipeline C above. Still no bind-pose/bone-roll correction; that remains a Blender/Cascadeur job.
2. Server-authoritative damage from equipped weapon skins everywhere (partially there).  
3. Weapon-only VFX clips (muzzle flash / reload) without replacing Attack.  
4. Gate or remove `/anim-test` once conversion is forever frozen.
