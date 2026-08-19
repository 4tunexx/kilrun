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

export function liveCloudMismatchMessage(
  editorName: string,
  cloud: CloudActiveMapMeta
): string {
  return `Live matches still use “${cloud.name}”, not “${editorName}”. Set as MAIN to publish this map.`;
}
