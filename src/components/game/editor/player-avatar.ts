/**
 * Shared player avatar loading for Player Model studio, Play Test, and match.
 * Default = pack Body_Blue_001 + Basic_Character animations (no Kenney mannequin).
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
import { normalizeCharacter } from '../renderer/asset-loader';
import {
  DEFAULT_PACK_PLAYER_URL,
  isLegacyPlayerModel,
  isPackPlayerUrl,
  loadPackPlayerPrefab,
} from '../renderer/pack-player';
import {
  applyExtraBones,
  applyPlayerMeshEdits,
  authoredClipsToThree,
} from './player-mesh-edits';
import { BODY_COLOR_SOLO_DEFAULT } from '@/lib/body-colors';
import { applyTeamTint } from '@/lib/premium-skin-config';

export interface LoadedPlayerAvatar {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  clipNames: string[];
  /** True when using pack Blue-001 default (not a custom fullbody override). */
  isDefaultMannequin: boolean;
}

/** Resolve avatar entity from the map (first `player` kind). */
export function getMapPlayerAvatar(doc: MapDocument | null | undefined): EditorEntity | undefined {
  if (!doc) return undefined;
  return findPlayerEntity(doc);
}

/**
 * Force player entity onto pack Blue-001 (clears legacy mannequin / data-URL / props).
 */
export function migratePlayerEntityToPackBlue(
  entity: EditorEntity
): Partial<EditorEntity> | null {
  if (
    entity.customModelUrl === DEFAULT_PACK_PLAYER_URL &&
    !entity.model
  ) {
    return null;
  }
  if (
    isPackPlayerUrl(entity.customModelUrl) &&
    !isLegacyPlayerModel(entity.model, entity.customModelUrl)
  ) {
    return null;
  }
  return {
    model: undefined,
    customModelUrl: DEFAULT_PACK_PLAYER_URL,
    playerAnims: {},
    animation: defaultAnimation(),
  };
}

/**
 * Ensure the map has a player avatar entity. Creates one on the Spawns layer
 * (or first layer) if missing. Always points at pack Blue-001.
 */
export function ensureMapPlayerEntity(doc: MapDocument): {
  doc: MapDocument;
  entity: EditorEntity;
  created: boolean;
} {
  const existing = findPlayerEntity(doc);
  if (existing) {
    const patch = migratePlayerEntityToPackBlue(existing);
    if (!patch) return { doc, entity: existing, created: false };
    const entity = { ...existing, ...patch };
    return {
      doc: {
        ...doc,
        entities: doc.entities.map((e) => (e.id === existing.id ? entity : e)),
      },
      entity,
      created: false,
    };
  }

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
    position: [0, -1000, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: false,
    animation: defaultAnimation(),
    playerAnims: {},
    customModelUrl: DEFAULT_PACK_PLAYER_URL,
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
  const byName = new Map<string, THREE.AnimationClip>();
  for (const c of merged) byName.set(c.name || '(unnamed)', c);
  const finalClips = Array.from(byName.values());
  const clipNames = finalClips.map((c) => c.name || '(unnamed)');
  return { scene, animations: finalClips, clipNames, isDefaultMannequin };
}

/** Load skinned scene + clips for an avatar entity (pack Blue-001 by default). */
export async function loadPlayerAvatar(
  entity?: EditorEntity | null,
  modelOverrideUrl?: string | null
): Promise<LoadedPlayerAvatar> {
  const rawSrc = modelOverrideUrl || resolveModelSrc(entity?.model, entity?.customModelUrl);
  const usePackDefault =
    !rawSrc ||
    (!modelOverrideUrl && isLegacyPlayerModel(entity?.model, entity?.customModelUrl)) ||
    rawSrc === DEFAULT_PACK_PLAYER_URL ||
    (isPackPlayerUrl(rawSrc) && /Body_Blue_001/i.test(rawSrc));

  if (usePackDefault || !rawSrc) {
    const modelUrl =
      rawSrc && isPackPlayerUrl(rawSrc) && !isLegacyPlayerModel(entity?.model, entity?.customModelUrl)
        ? rawSrc
        : DEFAULT_PACK_PLAYER_URL;
    const { scene, animations } = await loadPackPlayerPrefab({
      modelUrl,
      // Gameplay bodyColorIndex applied later in ThreeCharacter; editor uses blue tint
      skipTint: false,
    });
    applyTeamTint(scene, BODY_COLOR_SOLO_DEFAULT, { preferEmissive: false });
    return finalizeAvatar(entity, scene, animations, true);
  }

  // Any Characters_7 pack FBX (bodies OR fullbody skins) shares the same Rigify
  // DEF- rig, so it can reuse the converted pack animation clips. Only body meshes
  // get the blue gameplay tint; fullbody premium skins keep their own materials.
  if (/\/game\/skins\//i.test(rawSrc) && /\.fbx(\?|$)/i.test(rawSrc)) {
    const isBody = /\/bodies\//i.test(rawSrc);
    const { scene, animations } = await loadPackPlayerPrefab({
      modelUrl: rawSrc,
      skipTint: !isBody,
    });
    return finalizeAvatar(entity, scene, animations, false);
  }

  const { root, clips } = await loadAnimatedPrefab(rawSrc);
  return finalizeAvatar(entity, root, clips, false);
}

/**
 * Match map-editor sizing: plant feet, then apply the entity's authored XYZ scale.
 */
export function fitAvatarLikeEditor(
  mesh: THREE.Object3D,
  entity: EditorEntity | null | undefined,
  _isDefaultMannequin: boolean
): THREE.Group {
  const wrap = new THREE.Group();
  wrap.name = 'avatar-fit';
  // Player studio and skin studio both author against 1.75m. Normalize every
  // runtime avatar to that same planted height so pack bodies, full-body skins,
  // and rebound clothes have identical proportions and offsets.
  normalizeCharacter(mesh, 1.75);
  wrap.add(mesh);
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
