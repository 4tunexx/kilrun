/**
 * Pack player character: Body_Blue_001 mesh + Characters_7 pack animation clips.
 * The pack FBX have NO embedded takes; the 24 Unity `.anim` clips are converted
 * to `pack-anims.json` (see scripts/convert-unity-anims.js) and rebuilt here onto
 * the mesh's Rigify `DEF-` skeleton.
 */

import * as THREE from 'three';
import { cloneFbxScene, loadFbxModel } from './asset-loader-fbx';
import { packBodyTintHex } from '@/lib/pack-body-colors';
import { BODY_COLOR_SOLO_DEFAULT } from '@/lib/body-colors';
import { applyTeamTint } from '@/lib/premium-skin-config';
import {
  loadPackAnimsFile,
  buildPackClips,
  makeBoneResolver,
} from '@/lib/unity-anim';

/** Default everywhere — gameplay colors are material tints on this mesh. */
export const DEFAULT_PACK_PLAYER_URL = '/game/skins/bodies/Body_Blue_001.fbx';
/**
 * Animations ship as Unity `.anim` clips (the pack FBX have NO embedded takes).
 * They are pre-converted to `/game/skins/anim/pack-anims.json` by
 * `scripts/convert-unity-anims.js` and rebuilt into THREE clips at runtime.
 */
export const PACK_PLAYER_ANIM_URL = '/game/skins/anim/pack-anims.json';

export function isPackPlayerUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\/game\/skins\/bodies\/(Body_|Basic_Character)/i.test(url);
}

/** True for legacy mannequin / prototype / random uploads we no longer want as player base. */
export function isLegacyPlayerModel(
  model?: string | null,
  customModelUrl?: string | null
): boolean {
  if (customModelUrl?.startsWith('/game/skins/')) {
    // Pack fullbody / other cosmetics are OK; bare non-body paths stay
    return false;
  }
  if (customModelUrl?.startsWith('data:')) return true;
  if (model && model !== '' && !model.startsWith('/game/skins/')) return true;
  if (!model && !customModelUrl) return false; // will use pack default
  return Boolean(customModelUrl && !isPackPlayerUrl(customModelUrl));
}

function applyDefaultBlueTint(scene: THREE.Object3D, modelUrl: string) {
  const packTint = packBodyTintHex(modelUrl);
  if (packTint != null) {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat && 'color' in mat && (mat as THREE.MeshStandardMaterial).color) {
          (mat as THREE.MeshStandardMaterial).color.setHex(packTint);
          (mat as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      }
    });
    return;
  }
  applyTeamTint(scene, BODY_COLOR_SOLO_DEFAULT, { preferEmissive: false });
}

/**
 * Load the pack Blue-001 player with the full Characters_7 animation set.
 */
export async function loadPackPlayerPrefab(opts?: {
  /** Override mesh URL (must be a bodies/*.fbx for best anim match). */
  modelUrl?: string;
  /** Skip blue tint (caller applies gameplay bodyColorIndex). */
  skipTint?: boolean;
}): Promise<{
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  modelUrl: string;
}> {
  const modelUrl = opts?.modelUrl || DEFAULT_PACK_PLAYER_URL;
  const [body, packFile] = await Promise.all([
    loadFbxModel(modelUrl),
    loadPackAnimsFile().catch((err) => {
      console.warn('[pack-player] pack-anims.json failed', err);
      return null;
    }),
  ]);

  const scene = cloneFbxScene(body.scene);
  if (!opts?.skipTint) applyDefaultBlueTint(scene, modelUrl);

  // Build the Characters_7 clip set against THIS mesh's actual bone names
  // (FBXLoader strips dots, so we resolve DEF-spine.001 -> DEF-spine001 etc.).
  let animations: THREE.AnimationClip[] = [];
  if (packFile) {
    const resolveBone = makeBoneResolver(scene);
    animations = buildPackClips(packFile, {
      resolveBone,
      // Unity rest quats for arms are mirrored in YZ vs FBX bind — flipX fixes it.
      // Legs/spine match either way; flipX is the global safe choice for this pack.
      mode: 'flipX',
      // Unity scale keys fight the FBX bind pose; keep mesh scale from the file.
      skipScale: true,
      // Unity position keys are near-zero deltas in a different space than FBX
      // bind translations — applying them collapses the spine. Keep bind poses.
      skipPosition: true,
    });
  }
  // Fallback: any clip embedded on the mesh (normally none for the pack).
  if (!animations.length) animations = body.animations ?? [];

  return { scene, animations, modelUrl };
}
