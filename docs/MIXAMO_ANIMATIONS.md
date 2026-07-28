# Mixamo animations for the default Kilrun body

Use this when you want more idle / run / jump / attack clips on the pack player
(`Body_Blue_001` / inventory preview). Easiest path that works with our FBX pipeline.

## What you need

1. [Mixamo](https://www.mixamo.com) (free Adobe account)
2. Your **base body FBX** already in the project  
   (`public/game/skins/bodies/Body_Blue_001.fbx` or export one from Blender)
3. Optional: Blender to merge clips later

## Method A — Fastest (recommended): download clips only

Mixamo can retarget animations onto a character **without** replacing the mesh.

1. Open Mixamo → **Upload Character**
2. Upload `Body_Blue_001.fbx` (or a T-pose export of the same rig)
3. Wait for auto-rig / mapping to finish (accept defaults if the pack already has a skeleton)
4. Pick an animation (Idle, Walking, Running, Jump, Punch, etc.)
5. Settings that work well for Kilrun:
   - **Skin**: *Without Skin* (we keep our mesh; we only want the clip)
   - **Format**: FBX Binary
   - **Frames per second**: 30
   - **Keyframe Reduction**: none / default
6. Download → rename clearly, e.g. `Idle.fbx`, `Run.fbx`, `Jump.fbx`
7. Drop files into `public/game/skins/anims/` (create the folder if missing)
8. In **Map Editor → Player Model → Anims**, refresh clips / re-bind Idle, Walk, Run, Jump, Attack
9. Inventory admin clip name can be set to the exact Mixamo clip name (Admin → Inventory)

Our loader already merges pack `pack-anims.json` clips onto the body. Adding more FBX
clips into the pack anim set (or binding them in Player Model studio) is enough — you do
**not** need a second fullbody mesh.

## Method B — One character + many animations (Mixamo “Pack”)

1. Upload the same body once
2. For each move: Download **With Skin** only if you are rebuilding the whole character;
   prefer **Without Skin** for add-on clips
3. In Blender: File → Import FBX (body) → Import each anim FBX → NLA / Action editor →
   push down actions → Export one FBX with multiple actions  
   *(Advanced — only if you want a single file)*

## Naming tips (so auto-bind works)

Name clips so Kilrun’s fuzzy binder finds them:

| Role   | Good names contain |
|--------|--------------------|
| Idle   | `idle`, `stand`, `breath` |
| Walk   | `walk`, `locomotion` |
| Run    | `run`, `sprint` |
| Jump   | `jump` |
| Land   | `land`, `falling_to_landing` |
| Attack | `attack`, `slash`, `punch` |

Exact names can be typed in **Admin → Inventory → Animation clip name**.

## Checklist after import

- [ ] Clip plays in Player Model studio turntable  
- [ ] Play Test uses walk/run/jump  
- [ ] Inventory preview uses idle (or your admin clip)  
- [ ] Weapon shop / melee still triggers attack/punch slot  

## Do **not**

- Re-upload a random Mixamo “Y Bot” as the default body (bone names won’t match skins)
- Mix FPS (24 vs 30) across clips on the same mixer without testing
- Expect gun reload clips on the **character** — those belong on the weapon GLB (Weapon Editor → Anims)

## For Horde / Competitive weapons

Weapon meshes are under `/game/weapons/*.glb`. Character swing still comes from the
**player** attack/punch clip; the gun/axe is parented to the hand bone. More Mixamo
attack clips improve melee feel; hitscan mostly needs a short fire pose / recoil
(already in Weapon Editor).
