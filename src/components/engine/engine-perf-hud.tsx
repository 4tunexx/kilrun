'use client';

import React from 'react';
import type { EditorRenderStats } from '@/components/game/editor/editor-viewport';

export function EnginePerfHud({
  stats,
  entityCount,
  collisionBoxes,
  hidden,
}: {
  stats: EditorRenderStats | null;
  entityCount: number;
  collisionBoxes: number;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="shrink-0 h-7 px-3 flex items-center gap-3 border-t border-white/10 bg-[#080c12] text-[10px] font-mono tracking-wide text-slate-400 overflow-x-auto whitespace-nowrap">
      <span className="text-cyan-300 font-semibold">
        {stats ? `${stats.fps.toFixed(0)} FPS` : '— FPS'}
      </span>
      <span>{stats ? `${stats.frameMs.toFixed(1)} ms` : '—'}</span>
      <span className="text-slate-500">|</span>
      <span>{stats?.webgl ?? 'WebGL'}</span>
      {stats?.gpu ? (
        <span className="truncate max-w-[220px]" title={stats.gpu}>
          {stats.gpu}
        </span>
      ) : null}
      <span className="text-slate-500">|</span>
      <span>{stats ? `${stats.calls} draws` : '—'}</span>
      <span>{stats ? `${stats.triangles.toLocaleString()} tris` : '—'}</span>
      <span>{stats ? `${stats.textures} tex` : '—'}</span>
      <span className="text-slate-500">|</span>
      <span>{entityCount} entities</span>
      <span>{collisionBoxes} collision</span>
      {stats?.idle ? <span className="text-slate-500">idle</span> : null}
    </div>
  );
}
