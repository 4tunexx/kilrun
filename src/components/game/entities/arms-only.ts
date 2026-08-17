import * as THREE from 'three';

/** Hide torso/legs; keep arms, hands, and weapon meshes (FPS-style view). */
export function applyArmsOnlyMeshVisibility(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!on) {
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.visible = true;
      return;
    }
    const n = `${mesh.name} ${o.parent?.name ?? ''}`.toLowerCase();
    const keep =
      /arm|hand|finger|weapon|gun|pistol|rifle|knife|hold|grip|forearm|shoulder/.test(n);
    const hideBody =
      /hip|leg|thigh|shin|foot|toe|spine|pelvis|torso|chest|head|hair|pants|boot/.test(n);
    if (keep) mesh.visible = true;
    else if (hideBody) mesh.visible = false;
    else mesh.visible = true;
  });
}
