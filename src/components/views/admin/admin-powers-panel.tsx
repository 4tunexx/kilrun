'use client';

import { PowerEditor } from '@/components/game/editor/power-editor';

/**
 * Top-level admin entry point for the Power Editor / skill tree — mounts the
 * same account-wide editor the map editor's "Powers" sidebar tab uses
 * (src/components/game/editor/power-editor.tsx), without requiring a map to
 * be opened first. Powers aren't map data (see power-editor.tsx's header
 * comment), so gating them behind "open some map" was pure discoverability
 * friction — this tab is the direct path.
 */
export function AdminPowersPanel() {
  return (
    <div className="h-[calc(100vh-220px)] min-h-[560px] rounded-xl border border-slate-700/60 overflow-hidden">
      <PowerEditor embedded onClose={() => {}} />
    </div>
  );
}
