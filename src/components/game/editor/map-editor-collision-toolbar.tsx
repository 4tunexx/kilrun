'use client';

import type { MapDocument } from './map-document';
import { findCollisionMismatches } from './collision-mismatch';

/** COL toggle + mismatch count + bake — extracted from map-editor.tsx chrome. */
export function MapEditorCollisionToolbar({
  showAll,
  onToggle,
  doc,
  baking,
  onBakeMismatched,
}: {
  showAll: boolean;
  onToggle: () => void;
  doc: MapDocument;
  baking?: boolean;
  onBakeMismatched?: () => void;
}) {
  const mismatches = findCollisionMismatches(doc);
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onToggle}
        title={
          mismatches.length
            ? `${mismatches.length} solid(s) need mesh collision bake (amber gizmos)`
            : 'Show all solid/collision pads (green) — not selection'
        }
        className={`h-8 px-1.5 rounded-md text-[9px] font-bold ${
          showAll ? 'bg-emerald-500/20 text-emerald-200' : 'text-emerald-300 hover:bg-white/10'
        }`}
      >
        COL{mismatches.length ? ` ${mismatches.length}` : ''}
      </button>
      {mismatches.length > 0 && onBakeMismatched ? (
        <button
          type="button"
          disabled={baking}
          onClick={onBakeMismatched}
          title="Voxel-bake mesh collision for the amber-flagged solids only"
          className="h-8 px-1.5 rounded-md text-[9px] font-bold text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
        >
          {baking ? '…' : 'BAKE'}
        </button>
      ) : null}
    </div>
  );
}
