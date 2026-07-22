/**
 * Shared player avatar loading for Player Model studio, Play Test, and match.
 */
import * as THREE from 'three';
import type { EditorEntity, MapDocument, PlayerAnimBindings } from './map-document';
import {
  defaultAnimation,
  findPlayerEntity,
  generateId,
  suggestPlayerBindings,
} from './map-document';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { loadCharacterPrefab, normalizeCharacter } from '../renderer/asset-loader';
import { plantLocalFeet } from './editor-mesh';
import {
  applyExtraBones,
  applyPlayerMeshEdits,
  authoredClipsToThree,
} from './player-mesh-edits';

export interface LoadedPlayerAvatar {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  clipNames: string[];
  /** True when using built-in mannequin + anim packs. */
  isDefaultMannequin: boolean;
}

/** Resolve avatar entity from the map (first `player` kind). */
export function getMapPlayerAvatar(doc: MapDocument | null | undefined): EditorEntity | undefined {
  if (!doc) return undefined;
  return findPlayerEntity(doc);
}

/**
 * Ensure the map has a player avatar entity. Creates one on the Spawns layer
 * (or first layer) if missing. Does not place it in the viewport — caller
 * should sync the doc.
 */
export function ensureMapPlayerEntity(doc: MapDocument): {
  doc: MapDocument;
  entity: EditorEntity;
  created: boolean;
} {
  const existing = findPlayerEntity(doc);
  if (existing) return { doc, entity: existing, created: false };

  const layerId =
    doc.layers.find((l) => /spawn/i.test(l.name))?.id ??
    doc.layers[doc.layers.length - 1]?.id ??
    doc.layers[0]?.id ??
    'layer_0';

  const entity: EditorEntity = {
    id: generateId(),
    name: 'Player Avatar',
    kind: 'player',
    layerId,
    // Not placed on the map — platform settings only (Player Model / 3rd View).
    position: [0, -1000, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: false,
    animation: defaultAnimation(),
    playerAnims: {},
  };

  return {
    doc: { ...doc, entities: [...doc.entities, entity] },
    entity,
    created: true,
  };
}

function finalizeAvatar(
  entity: EditorEntity | null | undefined,
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[],
  isDefaultMannequin: boolean
): LoadedPlayerAvatar {
  applyExtraBones(scene, entity?.playerExtraBones);
  applyPlayerMeshEdits(scene, entity?.playerMeshEdits);
  const authored = authoredClipsToThree(entity?.playerAuthoredClips);
  const merged = [...animations, ...authored];
  // Prefer authored clip when names collide.
  const byName = new Map<string, THREE.AnimationClip>();
  for (const c of merged) byName.set(c.name || '(unnamed)', c);
  const finalClips = Array.from(byName.values());
  const clipNames = finalClips.map((c) => c.name || '(unnamed)');
  return { scene, animations: finalClips, clipNames, isDefaultMannequin };
}

/** Load skinned scene + clips for an avatar entity (or default mannequin). */
export async function loadPlayerAvatar(
  entity?: EditorEntity | null
): Promise<LoadedPlayerAvatar> {
  const src = resolveModelSrc(entity?.model, entity?.customModelUrl);
  if (!src) {
    const { scene, animations } = await loadCharacterPrefab();
    return finalizeAvatar(entity, scene, animations, true);
  }
  const { root, clips } = await loadAnimatedPrefab(src);
  return finalizeAvatar(entity, root, clips, false);
}

/**
 * Match map-editor sizing: plant feet, then apply the entity's authored XYZ scale.
 * Do NOT force a target height — that made Play Test / match look bigger/smaller
 * than the same avatar next to platforms in the editor.
 *
 * Default mannequin (no authored model) is height-fit to ~1.6m so it matches the
 * editor's blue capsule placeholder, then multiplied by entity.scale.
 */
export function fitAvatarLikeEditor(
  mesh: THREE.Object3D,
  entity: EditorEntity | null | undefined,
  isDefaultMannequin: boolean
): THREE.Group {
  const wrap = new THREE.Group();
  wrap.name = 'avatar-fit';
  if (isDefaultMannequin && !entity?.model && !entity?.customModelUrl) {
    normalizeCharacter(mesh, 1.6);
    wrap.add(mesh);
  } else {
    plantLocalFeet(mesh);
    wrap.add(mesh);
  }
  const sx = entity?.scale?.[0] ?? 1;
  const sy = entity?.scale?.[1] ?? 1;
  const sz = entity?.scale?.[2] ?? 1;
  wrap.scale.set(
    Number.isFinite(sx) && sx !== 0 ? sx : 1,
    Number.isFinite(sy) && sy !== 0 ? sy : 1,
    Number.isFinite(sz) && sz !== 0 ? sz : 1
  );
  return wrap;
}

/** Authored avatar scale (before TPS framing multiplier). */
export function avatarAuthoredScale(
  entity: EditorEntity | null | undefined
): [number, number, number] {
  const sx = entity?.scale?.[0] ?? 1;
  const sy = entity?.scale?.[1] ?? 1;
  const sz = entity?.scale?.[2] ?? 1;
  return [
    Number.isFinite(sx) && sx !== 0 ? sx : 1,
    Number.isFinite(sy) && sy !== 0 ? sy : 1,
    Number.isFinite(sz) && sz !== 0 ? sz : 1,
  ];
}

/** Merge scanned clips into entity.animation.availableClips + optional auto-bind. */
export function applyClipsToPlayerEntity(
  entity: EditorEntity,
  clipNames: string[],
  autoBindIfEmpty = true
): Partial<EditorEntity> {
  const anim = {
    ...(entity.animation ?? defaultAnimation()),
    availableClips: clipNames,
  };
  const emptyBindings = !entity.playerAnims || Object.keys(entity.playerAnims).length === 0;
  const playerAnims: PlayerAnimBindings | undefined =
    autoBindIfEmpty && emptyBindings && clipNames.length
      ? suggestPlayerBindings(clipNames)
      : entity.playerAnims;
  return { animation: anim, playerAnims };
}
