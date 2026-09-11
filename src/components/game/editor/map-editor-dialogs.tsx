'use client';

import { Button } from '@/components/ui/button';

export type PlayTestRole = 'runner' | 'trapper' | 'team_a' | 'team_b';

export function MapEditorPlayTestRolePrompt({
  gameMode,
  onPick,
  onCancel,
}: {
  gameMode: string;
  onPick: (role: PlayTestRole) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10060] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm space-y-3">
        <p className="text-sm font-semibold text-slate-100">Test as which player?</p>
        <p className="text-xs text-slate-400">
          Spawns you at that role&apos;s placed spawn point (falls back to the default spawn if none
          is placed yet).
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {gameMode === 'deathrun' ? (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => onPick('runner')}
              >
                Runner
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-500 text-white"
                onClick={() => onPick('trapper')}
              >
                Trapper
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-500 text-white"
                onClick={() => onPick('team_a')}
              >
                Team A
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white"
                onClick={() => onPick('team_b')}
              >
                Team B
              </Button>
            </>
          )}
        </div>
        <Button size="sm" variant="ghost" className="w-full text-slate-400" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function MapEditorPrefabUploadDialog({
  name,
  category,
  categories,
  busy,
  canSubmit,
  onFile,
  onName,
  onCategory,
  onSubmit,
  onCancel,
}: {
  name: string;
  category: string;
  categories: string[];
  busy: boolean;
  canSubmit: boolean;
  onFile: (file: File | null) => void;
  onName: (name: string) => void;
  onCategory: (category: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10060] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm space-y-3">
        <p className="text-sm font-semibold text-slate-100">Upload prefab model</p>
        <p className="text-xs text-slate-400">
          .glb, .gltf, or .fbx — appears in the catalog for every mapper immediately.
        </p>
        <input
          type="file"
          accept=".glb,.gltf,.fbx,.obj"
          className="w-full text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-white"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <input
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
          placeholder="Name (e.g. Wooden Crate)"
          value={name}
          onChange={(e) => onName(e.target.value)}
        />
        <input
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
          placeholder="Category (existing or new)"
          list="prefab-category-options"
          value={category}
          onChange={(e) => onCategory(e.target.value)}
        />
        <datalist id="prefab-category-options">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={busy || !canSubmit} onClick={onSubmit}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
          <Button size="sm" variant="ghost" className="text-slate-400" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
