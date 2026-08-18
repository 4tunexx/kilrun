'use client';

import { Magnet, Stamp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMapGameMode } from '../map-document';
import { deletePrefab, instantiatePrefab, listPrefabs, savePrefab } from '../prefab-storage';
import { SNAP_FACE_LABELS, SnapFacePicker } from '../snap-face-picker';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function PrefabsPanel({ brains }: { brains: MapEditorBrains }) {
  const {
    doc,
    isMobile,
    selectedId,
    selectedIds,
    activeLayerId,
    apiRef,
    toast,
    prefabs,
    setPrefabs,
    cloudPrefabs,
    setCloudPrefabs,
    prefabName,
    setPrefabName,
    prefabSnapBtnRef,
    snapFaceMenuOpen,
    setSnapFaceMenuOpen,
    snapFaceAnchorRect,
    setSnapFaceAnchorRect,
    setSidebarOpen,
    setUiCollapsed,
  } = brains;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
      <p className="text-[10px] tracking-widest text-white/50 uppercase">Prefabs / Stamps</p>
      <p className="text-[11px] text-white/55 leading-relaxed">
        Shift+click to multi-select ({selectedIds.length || (selectedId ? 1 : 0)} selected).
        With 2+ selected, press Snap and pick which side to join — the first object you
        selected is the anchor and stays put.
      </p>
      {selectedIds.length >= 2 && (
        <div className="relative">
          <Button
            ref={prefabSnapBtnRef}
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => {
              setSnapFaceAnchorRect(prefabSnapBtnRef.current?.getBoundingClientRect() ?? null);
              setSnapFaceMenuOpen((v) => !v);
            }}
          >
            <Magnet className="w-4 h-4 mr-1" /> Snap…
          </Button>
          {snapFaceMenuOpen && (
            <SnapFacePicker
              anchorRect={snapFaceAnchorRect}
              onPick={(face, opts) => {
                const ok = apiRef.current?.snapSelectedToFace(face, selectedIds, opts);
                setSnapFaceMenuOpen(false);
                if (ok) {
                  toast({
                    title: 'Snapped',
                    description: `Joined ${SNAP_FACE_LABELS[face]} of the first-selected object${
                      opts.alignRotation ? ', turned to match its angle' : ''
                    }.`,
                  });
                } else {
                  toast({
                    title: 'Snap failed',
                    description: 'Select 2+ unlocked objects, then try again.',
                    variant: 'destructive',
                  });
                }
              }}
              onSnapTogether={() => {
                const ok = apiRef.current?.snapSelectedTogether(selectedIds);
                setSnapFaceMenuOpen(false);
                toast({
                  title: ok ? 'Lined up' : 'Line up failed',
                  description: ok
                    ? 'Shared bottom, edge to edge along X.'
                    : 'Select 2+ unlocked objects, then try again.',
                  variant: ok ? undefined : 'destructive',
                });
              }}
              onClose={() => setSnapFaceMenuOpen(false)}
            />
          )}
        </div>
      )}
      <input
        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
        value={prefabName}
        onChange={(e) => setPrefabName(e.target.value)}
        placeholder="Prefab name"
      />
      <Button
        size="sm"
        className="w-full"
        disabled={!(selectedIds.length || selectedId)}
        onClick={() => {
          const ids = selectedIds.length
            ? selectedIds
            : selectedId
              ? [selectedId]
              : [];
          const ents = doc.entities.filter((e) => ids.includes(e.id));
          if (!ents.length) return;
          try {
            savePrefab(prefabName.trim() || 'Prefab', ents);
            setPrefabs(listPrefabs());
            toast({
              title: 'Prefab saved (this browser only)',
              description: `${prefabName.trim() || 'Prefab'} — use "Publish cloud" below to share it with other staff.`,
            });
          } catch (err) {
            toast({
              title: 'Prefab failed',
              description: err instanceof Error ? err.message : 'Could not save prefab',
              variant: 'destructive',
            });
          }
        }}
        title="Saves to this browser only — other staff won't see it until you Publish cloud"
      >
        <Stamp className="w-4 h-4 mr-1" /> Save selection as prefab (local)
      </Button>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={!(selectedIds.length || selectedId)}
          onClick={() => {
            const ids = selectedIds.length
              ? selectedIds
              : selectedId
                ? [selectedId]
                : [];
            const ents = doc.entities.filter((e) => ids.includes(e.id));
            if (!ents.length) return;
            void (async () => {
              try {
                const { publishCloudPrefab } = await import('@/lib/game-prefab-actions');
                const origin = ents[0].position;
                const relative = ents.map((e) => ({
                  ...e,
                  position: [
                    e.position[0] - origin[0],
                    e.position[1] - origin[1],
                    e.position[2] - origin[2],
                  ] as [number, number, number],
                }));
                await publishCloudPrefab({
                  name: prefabName.trim() || 'Prefab',
                  mode: getMapGameMode(doc),
                  entities: relative,
                  thumbnailDataUrl: await (async () => {
                    try {
                      const { renderMapThumbnail } = await import('../map-thumbnail');
                      const mini = {
                        ...doc,
                        name: prefabName.trim() || 'Prefab',
                        entities: relative,
                      };
                      return await renderMapThumbnail(mini);
                    } catch {
                      return null;
                    }
                  })(),
                });
                toast({ title: 'Published to cloud library' });
                const { listCloudPrefabs } = await import('@/lib/game-prefab-actions');
                setCloudPrefabs(await listCloudPrefabs(getMapGameMode(doc)));
              } catch (err) {
                toast({
                  title: 'Cloud publish failed',
                  description: err instanceof Error ? err.message : 'Error',
                  variant: 'destructive',
                });
              }
            })();
          }}
        >
          Publish cloud
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => {
            void (async () => {
              try {
                const { listCloudPrefabs } = await import('@/lib/game-prefab-actions');
                setCloudPrefabs(await listCloudPrefabs(getMapGameMode(doc)));
                toast({ title: 'Cloud library refreshed' });
              } catch (err) {
                toast({
                  title: 'Could not load cloud prefabs',
                  description:
                    err instanceof Error
                      ? err.message
                      : 'Unknown error — check your connection and admin/moderator role, then retry.',
                  variant: 'destructive',
                });
              }
            })();
          }}
        >
          Pull cloud
        </Button>
      </div>
      {cloudPrefabs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-cyan-300/70">Cloud library</p>
          {cloudPrefabs.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1 rounded border border-cyan-500/20 bg-cyan-500/5 p-2"
            >
              {p.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  className="h-10 w-10 rounded object-cover border border-white/10 shrink-0"
                />
              ) : null}
              <button
                type="button"
                className="flex-1 text-left text-xs hover:text-cyan-200"
                onClick={() => {
                  void (async () => {
                    try {
                      const { getCloudPrefabEntities } = await import(
                        '@/lib/game-prefab-actions'
                      );
                      const ents = await getCloudPrefabEntities(p.id);
                      const stamp = {
                        id: p.id,
                        name: p.name,
                        createdAt: p.updatedAt,
                        entities: ents,
                      };
                      const placed = instantiatePrefab(stamp, [0, 0, 0], activeLayerId);
                      apiRef.current?.stampEntities(placed);
                    } catch (err) {
                      toast({
                        title: 'Stamp failed',
                        description: err instanceof Error ? err.message : 'Error',
                        variant: 'destructive',
                      });
                    }
                  })();
                }}
              >
                <span className="font-bold text-white">{p.name}</span>
                <span className="text-white/40 block">
                  {p.entityCount} pieces · cloud
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-white/50">Local</p>
        {prefabs.length === 0 && (
          <p className="text-[11px] text-white/40">No local prefabs yet.</p>
        )}
        {prefabs.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1 rounded border border-white/10 bg-black/30 p-2"
          >
            <button
              type="button"
              className="flex-1 text-left text-xs hover:text-cyan-200"
              onClick={() => {
                const ents = instantiatePrefab(p, [0, 0, 0], activeLayerId);
                apiRef.current?.stampEntities(ents);
                if (isMobile) {
                  setSidebarOpen(false);
                  setUiCollapsed(true);
                }
              }}
              title="Click ground to stamp"
            >
              <span className="font-bold text-white">{p.name}</span>
              <span className="text-white/40 block">{p.entities.length} pieces</span>
            </button>
            <button
              type="button"
              className="text-red-300/80 hover:text-red-200 p-1"
              onClick={() => {
                deletePrefab(p.id);
                setPrefabs(listPrefabs());
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export const prefabsPlugin: MapEditorPlugin = {
  id: 'prefabs',
  slot: 'sidebar',
  label: 'Prefabs',
  icon: Stamp,
  order: 40,
  render: (brains) => <PrefabsPanel brains={brains} />,
};
