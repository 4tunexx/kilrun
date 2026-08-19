/**
 * Cloud Active/MAIN identity vs the map currently open in the editor.
 * Live matches always load Mongo `isActive`, not "whatever I last edited".
 */

export type CloudActiveMapMeta = {
  id: string;
  localId: string | null;
  name: string;
  updatedAt: string;
};

/** True when this editor document is the published live map for its mode. */
export function isEditorMapTheLiveCloudMap(
  editorLocalId: string,
  cloud: CloudActiveMapMeta | null | undefined
): boolean {
  if (!cloud) return false;
  return cloud.localId === editorLocalId || cloud.id === editorLocalId;
}

/**
 * MAIN badge in the editor: cloud Active identity wins whenever it is known.
 * Falling back to the browser's local MAIN flag while a *different* cloud
 * Active map exists made the toolbar claim this draft was live.
 */
export function isEditorMapLiveHere(
  editorLocalId: string,
  cloud: CloudActiveMapMeta | null | undefined,
  localActivePlayId: string | null | undefined
): boolean {
  if (cloud) return isEditorMapTheLiveCloudMap(editorLocalId, cloud);
  return localActivePlayId === editorLocalId;
}

export function liveCloudMismatchMessage(
  editorName: string,
  cloud: CloudActiveMapMeta
): string {
  return `Live matches still use “${cloud.name}”, not “${editorName}”. Set as MAIN to publish this map.`;
}
