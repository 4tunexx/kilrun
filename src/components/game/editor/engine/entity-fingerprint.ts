/**
 * Compact fingerprints for editor viewport sync.
 *
 * `syncDoc` used to `JSON.stringify` every entity on every edit. That walked
 * megabyte `customModelUrl` data-URLs, baked `meshCollisionPads`, nested
 * `csgSources`, and clip catalogs — O(n × payload) on a large map, even when
 * only a pose changed. These helpers hash only what the viewport actually
 * reads to build / patch a mesh.
 */
import type { EditorEntity } from '../map-document';

/**
 * Identity for a texture/model URL that never embeds a data-URL payload.
 * Catalog paths pass through; `data:` URLs are reduced to length + a few
 * samples so a re-upload still invalidates the key in O(1).
 */
export function compactAssetKey(url: string | undefined | null): string {
  if (!url) return '';
  if (!url.startsWith('data:')) return url;
  const comma = url.indexOf(',');
  const metaEnd = comma >= 0 ? Math.min(comma, 64) : Math.min(url.length, 64);
  const mid = url.length >> 1;
  const q = url.length >> 2;
  return [
    'data',
    url.length,
    url.slice(0, metaEnd),
    url.charCodeAt(Math.min(64, url.length - 1)),
    url.charCodeAt(mid),
    url.charCodeAt(q),
    url.charCodeAt(url.length - 1),
  ].join(':');
}

function num3(v: [number, number, number] | undefined | null): string {
  return v ? `${v[0]},${v[1]},${v[2]}` : '';
}

function num2(v: [number, number] | undefined | null): string {
  return v ? `${v[0]},${v[1]}` : '';
}

/**
 * Everything `syncEntity` reads after deciding which object to build.
 * Collision pads, CSG sources, animation clip catalogs, and names are
 * deliberately omitted — they do not change the mesh.
 */
export function entityVisualFingerprint(
  ent: EditorEntity,
  opts: { envTextureKey: string; layerHidden: boolean }
): string {
  return [
    opts.layerHidden ? '0' : '1',
    opts.envTextureKey,
    ent.kind,
    compactAssetKey(ent.model),
    compactAssetKey(ent.customModelUrl),
    ent.primitive ?? '',
    num3(ent.collisionSize),
    num3(ent.position),
    num3(ent.rotation),
    num3(ent.scale),
    ent.color ?? '',
    ent.opacity ?? '',
    ent.visible === false ? '0' : '1',
    compactAssetKey(ent.textureUrl),
    num2(ent.textureRepeat),
    ent.textureWorldScale ?? '',
    num2(ent.textureOffset),
    ent.textureRotation ?? '',
    JSON.stringify(ent.glow ?? null),
    JSON.stringify(ent.light ?? null),
    ent.jumpPad?.enabled ? '1' : '0',
    ent.hazard?.enabled ? '1' : '0',
    ent.spinHazard?.enabled ? '1' : '0',
    ent.spinHazard?.speed ?? '',
  ].join('|');
}

/**
 * Fields that force `syncEntity` to tear the root down and rebuild
 * (kind / model / hammer shape / light class). Pose and materials can be
 * patched in place.
 */
export function entityStructureFingerprint(ent: EditorEntity): string {
  return [
    ent.kind,
    compactAssetKey(ent.model),
    compactAssetKey(ent.customModelUrl),
    ent.primitive ?? '',
    num3(ent.collisionSize),
    ent.light?.type ?? '',
  ].join('|');
}
