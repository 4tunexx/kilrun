'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { formatDistanceToNow } from 'date-fns';
import {
  Copy,
  Download,
  Map as MapIcon,
  Plus,
  Star,
  Trash2,
  Upload,
  Pencil,
  RefreshCw,
  Skull,
  Swords,
  Users,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  createNewMap,
  deleteMap,
  duplicateMap,
  exportJson,
  formatBytes,
  getMapThumbnail,
  importJson,
  listMaps,
  loadMap,
  loadMapPlayable,
  saveMap,
  type MapListItem,
} from '@/components/game/editor/map-storage';
import {
  getActivePlayMapIdForMode,
  setActivePlayMapIdForMode,
} from '@/components/game/editor/prefab-storage';
import { useToast } from '@/hooks/use-toast';
import {
  KILRUN_MODE_INFO,
  KILRUN_MODES,
  type KilrunMode,
} from '@/lib/game-modes';
import { getMapGameMode } from '@/components/game/editor/map-document';
import { publishCloudMap } from '@/lib/game-map-actions';

const MapEditor = dynamic(() => import('@/components/game/editor/map-editor'), {
  ssr: false,
});

const MODE_ICONS: Record<KilrunMode, typeof Skull> = {
  deathrun: Skull,
  horde: Users,
  competitive: Swords,
};

export function AdminMapEditorPanel() {
  const { toast } = useToast();
  const [selectedMode, setSelectedMode] = useState<KilrunMode | null>(null);
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorMapId, setEditorMapId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!selectedMode) {
      setMaps([]);
      setActiveId(null);
      return;
    }
    for (const m of listMaps(selectedMode)) loadMapPlayable(m.id);
    setMaps(listMaps(selectedMode));
    setActiveId(getActivePlayMapIdForMode(selectedMode));
  }, [selectedMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = maps.filter(
    (m) => !query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  if (editorMapId) {
    return (
      <MapEditor
        isAdmin
        initialMapId={editorMapId}
        onClose={() => {
          setEditorMapId(null);
          refresh();
        }}
      />
    );
  }

  if (!selectedMode) {
    return (
      <div className="space-y-4">
        <Card className="border-slate-700/60 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-cyan-400" />
              Map Editor — choose game mode
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Each mode has its own map library, entities, and Active Match Map. Saved maps keep
              their mode.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {KILRUN_MODES.map((id) => {
                const info = KILRUN_MODE_INFO[id];
                const Icon = MODE_ICONS[id];
                const count = listMaps(id).length;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedMode(id)}
                    className={`text-left rounded-xl border bg-gradient-to-br p-4 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${info.accentClass}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-5 w-5 text-slate-100" />
                      <span className="font-semibold text-slate-100">{info.title}</span>
                    </div>
                    <p className="text-xs text-slate-300/90 leading-relaxed mb-3">
                      {info.editorBlurb}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{info.players}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {count} map{count === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const modeInfo = KILRUN_MODE_INFO[selectedMode];
  const ModeIcon = MODE_ICONS[selectedMode];

  return (
    <div className="space-y-4">
      <Card className="border-slate-700/60 bg-slate-900/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 mr-1"
                onClick={() => {
                  setSelectedMode(null);
                  setQuery('');
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <ModeIcon className="h-5 w-5 text-cyan-400" />
              {modeInfo.title} maps
              <Badge className={modeInfo.badgeClass}>{modeInfo.shortTitle}</Badge>
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                Mode
                <select
                  className="h-8 rounded-md border border-slate-700 bg-slate-950/80 px-2 text-slate-200"
                  value={selectedMode}
                  onChange={(e) => {
                    setSelectedMode(e.target.value as KilrunMode);
                    setQuery('');
                  }}
                >
                  {KILRUN_MODES.map((id) => (
                    <option key={id} value={id}>
                      {KILRUN_MODE_INFO[id].title}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                onClick={() => {
                  const { id } = createNewMap(
                    `${modeInfo.shortTitle} Map ${maps.length + 1}`,
                    selectedMode
                  );
                  refresh();
                  setEditorMapId(id);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> New map
              </Button>
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Import JSON
              </Button>
              <Button size="sm" variant="ghost" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">{modeInfo.editorBlurb}</p>
          <Input
            className="mt-2 max-w-sm bg-slate-950/60"
            placeholder="Search maps…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const doc = importJson(String(reader.result));
                  const importedMode = getMapGameMode(doc);
                  if (importedMode !== selectedMode) {
                    toast({
                      title: `Imported as ${KILRUN_MODE_INFO[importedMode].title}`,
                      description: 'Map mode comes from the JSON file.',
                    });
                  }
                  const { id } = createNewMap(
                    doc.name || f.name.replace(/\.json$/i, ''),
                    importedMode
                  );
                  saveMap(id, {
                    ...doc,
                    name: doc.name || id,
                    gameMode: importedMode,
                  });
                  if (importedMode === selectedMode) {
                    refresh();
                  }
                  toast({ title: `Imported “${doc.name || id}”` });
                } catch (err) {
                  toast({
                    title: err instanceof Error ? err.message : 'Import failed',
                    variant: 'destructive',
                  });
                }
              };
              reader.readAsText(f);
              e.target.value = '';
            }}
          />
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No {modeInfo.shortTitle} maps yet — create one or import JSON.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((m) => {
                const thumb = getMapThumbnail(m.id);
                const isActive = activeId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border overflow-hidden bg-slate-950/50 ${
                      isActive
                        ? 'border-emerald-500/50 ring-1 ring-emerald-500/30'
                        : 'border-slate-700/60'
                    }`}
                  >
                    <div className="aspect-video bg-slate-900 relative">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                          <MapIcon className="h-10 w-10" />
                        </div>
                      )}
                      {isActive && (
                        <Badge className="absolute top-2 left-2 bg-emerald-600">
                          Active {modeInfo.shortTitle}
                        </Badge>
                      )}
                      <Badge
                        className={`absolute top-2 right-2 ${modeInfo.badgeClass} text-[10px]`}
                      >
                        {modeInfo.shortTitle}
                      </Badge>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-100 truncate">{m.name}</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                        <span>{m.entityCount ?? '—'} entities</span>
                        <span>{m.floorCount ?? 0} floors</span>
                        <span>{m.trapCount ?? 0} traps</span>
                        <span>{m.hazardCount ?? 0} hazards</span>
                        <span>{formatBytes(m.sizeBytes)}</span>
                        <span>
                          {m.updatedAt
                            ? formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })
                            : '—'}
                        </span>
                      </div>
                      {m.createdAt && (
                        <p className="text-[10px] text-slate-500">
                          Created {new Date(m.createdAt).toLocaleString()}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 pt-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEditorMapId(m.id)}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Open
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => {
                            void (async () => {
                              setActivePlayMapIdForMode(selectedMode, m.id);
                              setActiveId(m.id);
                              const doc = loadMapPlayable(m.id);
                              if (doc) {
                                try {
                                  await publishCloudMap({
                                    localId: m.id,
                                    name: m.name,
                                    mode: selectedMode,
                                    document: doc,
                                    thumbnailDataUrl: getMapThumbnail(m.id),
                                    setActive: true,
                                  });
                                  toast({
                                    title: `“${m.name}” is Active ${modeInfo.shortTitle} map`,
                                    description: 'Published to cloud for all players.',
                                  });
                                  return;
                                } catch (err) {
                                  console.warn('[Active cloud publish]', err);
                                  toast({
                                    title: `“${m.name}” is Active locally`,
                                    description:
                                      'Cloud publish failed — run Admin → Sync database schema if GameMap is missing, then retry Active.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                              }
                              toast({
                                title: `“${m.name}” is Active ${modeInfo.shortTitle} map`,
                              });
                            })();
                          }}
                        >
                          <Star className="h-3 w-3 mr-1" /> Active
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            duplicateMap(m.id);
                            refresh();
                            toast({ title: 'Duplicated' });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            const doc = loadMap(m.id);
                            if (!doc) return;
                            const blob = new Blob([exportJson(doc)], {
                              type: 'application/json',
                            });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `${m.name.replace(/\s+/g, '_').toLowerCase()}.json`;
                            a.click();
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-400 hover:text-red-300"
                          onClick={() => {
                            if (!confirm(`Delete “${m.name}”?`)) return;
                            if (getActivePlayMapIdForMode(selectedMode) === m.id) {
                              setActivePlayMapIdForMode(selectedMode, null);
                            }
                            deleteMap(m.id);
                            refresh();
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
