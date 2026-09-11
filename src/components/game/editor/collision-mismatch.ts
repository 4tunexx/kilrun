/**
 * Mesh vs pad trust: flag solids whose visual volume does not match exported
 * collision (missing voxel bake, or a single box covering a hollow mesh).
 */
import type { EditorEntity, MapDocument } from './map-document';
import { entityExportsAsPlatform, entityWorldSize, isHammerSolidEntity } from './map-document';

export type CollisionMismatch = {
  entityId: string;
  reason: 'no-bake' | 'volume-mismatch';
  visualVolume: number;
  padCount: number;
};

const HOLLOW_HINT = /arch|doorway|window|pipe|tunnel|hollow|frame|fence|railing/i;

export function entityVisualVolume(ent: EditorEntity): number {
  const size = entityWorldSize(ent.collisionSize, ent.scale);
  return Math.abs(size[0] * size[1] * size[2]);
}

export function entityHasMeshCollisionBake(ent: EditorEntity): boolean {
  return Boolean(ent.meshCollisionPads?.length || ent.csgPads?.length);
}

export function shouldFlagMissingBake(ent: EditorEntity): boolean {
  if (!entityExportsAsPlatform(ent)) return false;
  if (isHammerSolidEntity(ent)) return false;
  if (entityHasMeshCollisionBake(ent)) return false;
  const model = `${ent.model || ''} ${ent.name || ''}`;
  if (HOLLOW_HINT.test(model)) return true;
  const size = entityWorldSize(ent.collisionSize, ent.scale);
  const height = size[1];
  const footprint = Math.max(size[0], size[2]);
  return height > 2.4 && footprint > 1.2;
}

export function findCollisionMismatches(doc: MapDocument | null | undefined): CollisionMismatch[] {
  if (!doc?.entities?.length) return [];
  const out: CollisionMismatch[] = [];
  for (const ent of doc.entities) {
    if (!entityExportsAsPlatform(ent)) continue;
    if (shouldFlagMissingBake(ent)) {
      out.push({
        entityId: ent.id,
        reason: 'no-bake',
        visualVolume: entityVisualVolume(ent),
        padCount: 1,
      });
      continue;
    }
    const pads = ent.meshCollisionPads?.length || ent.csgPads?.length || 0;
    if (pads > 0) {
      const vis = entityVisualVolume(ent);
      if (vis > 80 && pads < 2) {
        out.push({
          entityId: ent.id,
          reason: 'volume-mismatch',
          visualVolume: vis,
          padCount: pads,
        });
      }
    }
  }
  return out;
}

export function collisionMismatchIds(doc: MapDocument | null | undefined): Set<string> {
  return new Set(findCollisionMismatches(doc).map((row) => row.entityId));
}

export function entitiesNeedingCollisionBake(
  doc: MapDocument | null | undefined
): EditorEntity[] {
  const ids = collisionMismatchIds(doc);
  if (!ids.size || !doc?.entities?.length) return [];
  return doc.entities.filter((ent) => ids.has(ent.id));
}
