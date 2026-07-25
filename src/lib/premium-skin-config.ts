/**
 * Team / gameplay readability overlays for premium FullBody skins.
 * Default bodies use solid albedo tint; premium skins keep detail via emissive accent.
 */

import * as THREE from 'three';
import { getBodyColor, BODY_COLOR_NONE } from './body-colors';

const TEAM_TINT_USERDATA = 'kilrunTeamTint';

export interface AppliedTintState {
  bodyColorIndex: number;
  mode: 'albedo' | 'emissive' | 'none';
}

/**
 * Apply gameplay body color to a character scene.
 * - Default mannequin / simple meshes: multiply albedo color
 * - Premium / textured skins (`preferEmissive`): soft emissive rim so teams stay readable
 */
export function applyTeamTint(
  scene: THREE.Object3D,
  bodyColorIndex: number,
  opts?: { preferEmissive?: boolean; intensity?: number }
): AppliedTintState {
  if (bodyColorIndex === BODY_COLOR_NONE || bodyColorIndex < 0) {
    clearTeamTint(scene);
    return { bodyColorIndex: BODY_COLOR_NONE, mode: 'none' };
  }
  const def = getBodyColor(bodyColorIndex);
  if (!def) {
    clearTeamTint(scene);
    return { bodyColorIndex: BODY_COLOR_NONE, mode: 'none' };
  }

  const preferEmissive = opts?.preferEmissive ?? false;
  const intensity = opts?.intensity ?? (preferEmissive ? 0.35 : 0);

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) {
        continue;
      }
      const std = mat as THREE.MeshStandardMaterial;
      const ud = (std.userData[TEAM_TINT_USERDATA] ??= {
        color: std.color.clone(),
        emissive: std.emissive.clone(),
        emissiveIntensity: std.emissiveIntensity,
      }) as {
        color: THREE.Color;
        emissive: THREE.Color;
        emissiveIntensity: number;
      };

      if (preferEmissive) {
        std.color.copy(ud.color);
        std.emissive.setHex(def.emissiveAccent);
        std.emissiveIntensity = Math.max(ud.emissiveIntensity, intensity);
      } else {
        std.color.setHex(def.materialColor);
        std.emissive.copy(ud.emissive);
        std.emissiveIntensity = ud.emissiveIntensity;
      }
      std.needsUpdate = true;
    }
  });

  return {
    bodyColorIndex,
    mode: preferEmissive ? 'emissive' : 'albedo',
  };
}

export function clearTeamTint(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) {
        continue;
      }
      const std = mat as THREE.MeshStandardMaterial;
      const ud = std.userData[TEAM_TINT_USERDATA] as
        | { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }
        | undefined;
      if (!ud) continue;
      std.color.copy(ud.color);
      std.emissive.copy(ud.emissive);
      std.emissiveIntensity = ud.emissiveIntensity;
      std.needsUpdate = true;
    }
  });
}
