import type { MapDocument } from './map-document';

export function mapDocSnapshot(d: MapDocument): string {
  return JSON.stringify(d);
}

/**
 * Clicking / hovering a gizmo plate still fires onDocChange with the live
 * document. If that snapshot is pushed, the next Ctrl+Z is a no-op and the
 * user has to redo then undo again to reach the real prior state.
 */
export function isUsefulUndoSnapshot(snapshot: MapDocument, live: MapDocument): boolean {
  return mapDocSnapshot(snapshot) !== mapDocSnapshot(live);
}
