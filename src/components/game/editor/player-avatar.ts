/**
 * Shared player avatar loading for Player Model studio, Play Test, and match.
 */
import type { EditorEntity, MapDocument, PlayerAnimBindings } from './map-document';
import {
  defaultAnimation,
  findPlayerEntity,
  generateId,
  suggestPlayerBindings,
} from './map-document';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { loadCharacterPrefab } from '../renderer/asset-loader';
import {
  applyExtraBones,
  applyPlayerMeshEdits,
  authoredClipsToThree,
} from './player-mesh-edits';
import type * as THREE from 'three';

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
    position: [0, 0, -2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
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
