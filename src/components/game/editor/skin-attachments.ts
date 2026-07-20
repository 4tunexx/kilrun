/**
 * Attach skin meshes onto a player avatar (bone sockets or fallback offsets).
 */
import * as THREE from 'three';
import type { SkinAttachment } from '@/lib/player-skins';
import { SKIN_ATTACH_SLOTS } from '@/lib/player-skins';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';

const ATTACH_ROOT_NAME = '__skin_attachments';

export function clearSkinAttachments(avatarRoot: THREE.Object3D) {
  const existing = avatarRoot.getObjectByName(ATTACH_ROOT_NAME);
  if (existing) existing.removeFromParent();
}

function findBone(root: THREE.Object3D, hints: string[]): THREE.Object3D | null {
  const lowerHints = hints.map((h) => h.toLowerCase());
  let best: THREE.Object3D | null = null;
  root.traverse((o) => {
    const name = (o.name || '').toLowerCase();
    if (!name) return;
    if (lowerHints.some((h) => name.includes(h))) {
      if (!best || name.length < (best.name?.length ?? 99)) best = o;
    }
  });
  return best;
}

function plantLocal(mesh: THREE.Object3D) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  mesh.position.x -= center.x;
  mesh.position.z -= center.z;
  mesh.position.y -= box.min.y;
}

export async function applySkinAttachments(
  avatarRoot: THREE.Object3D,
  attachments: SkinAttachment[]
): Promise<void> {
  clearSkinAttachments(avatarRoot);
  if (!attachments.length) return;

  const group = new THREE.Group();
  group.name = ATTACH_ROOT_NAME;
  avatarRoot.add(group);

  for (const att of attachments) {
    const src = resolveModelSrc(att.model, att.customModelUrl);
    if (!src) continue;
    try {
      const { root } = await loadAnimatedPrefab(src);
      plantLocal(root);
      root.scale.set(...att.scale);
      root.rotation.set(
        THREE.MathUtils.degToRad(att.rotation[0]),
        THREE.MathUtils.degToRad(att.rotation[1]),
        THREE.MathUtils.degToRad(att.rotation[2])
      );
      if (att.color) {
        const color = att.color;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => {
              if ('color' in m) (m as THREE.MeshStandardMaterial).color?.set(color);
            });
          } else if (mat && 'color' in mat) {
            (mat as THREE.MeshStandardMaterial).color?.set(color);
          }
        });
      }

      const meta = SKIN_ATTACH_SLOTS.find((s) => s.id === att.slot);
      const boneName = att.bone;
      let parent: THREE.Object3D = group;
      if (boneName) {
        const named = avatarRoot.getObjectByName(boneName);
        if (named) parent = named;
      } else if (meta) {
        const bone = findBone(avatarRoot, meta.boneHints);
        if (bone) parent = bone;
      }

      const holder = new THREE.Group();
      holder.name = `skin_${att.slot}`;
      holder.position.set(...att.position);
      // When parented to a bone, offsets are local to that bone — use smaller defaults
      if (parent !== group) {
        // Keep authored offset; bones already provide world placement
        holder.position.set(
          att.position[0] - (meta?.defaultOffset[0] ?? 0),
          att.position[1] - (meta?.defaultOffset[1] ?? 0),
          att.position[2] - (meta?.defaultOffset[2] ?? 0)
        );
      }
      holder.add(root);
      parent.add(holder);
    } catch (err) {
      console.warn('[applySkinAttachments]', att.slot, err);
    }
  }
}
