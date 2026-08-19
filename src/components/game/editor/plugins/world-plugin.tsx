'use client';

import { CloudSun, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FloorPreset, SkyPreset } from '../map-document';
import { MOOD_PRESETS } from '../map-storage';
import { DEFAULT_EDITOR_PERF_MODE, LARGE_MAP_EDITOR_PERF_MODE } from '../editor-viewport';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function WorldPanel({ brains }: { brains: MapEditorBrains }) {
  const { env, patchEnv, skyFileRef, toast, editorPerf, setEditorPerf, apiRef } = brains;

  return (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Mood presets</p>
              <div className="flex flex-wrap gap-1">
                {MOOD_PRESETS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="text-[10px] px-2 py-1 rounded border border-white/15 hover:border-cyan-400/50 hover:bg-cyan-500/10"
                    onClick={() => patchEnv(m.env)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Sky / Surroundings</p>
              <label className="block text-xs text-white/60">
                Sky preset
                <select
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5"
                  value={env.sky}
                  onChange={(e) => patchEnv({ sky: e.target.value as SkyPreset })}
                >
                  <option value="cavern">Cavern</option>
                  <option value="dusk">Dusk</option>
                  <option value="bright">Bright</option>
                  <option value="void">Void</option>
                  <option value="custom">Custom color</option>
                </select>
              </label>
              <label className="block text-xs text-white/60">
                Sky color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.skyColor}
                  onChange={(e) => patchEnv({ sky: 'custom', skyColor: e.target.value })}
                />
              </label>
              <div className="space-y-1.5">
                <p className="text-xs text-white/60">Sky texture / background</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => skyFileRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" /> Upload sky image
                </Button>
                <input
                  ref={skyFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    // Upload to a persistent /uploads/site/... URL instead of
                    // embedding a base64 data URL in the map document — inline
                    // data URLs get silently stripped by publishCloudMap's
                    // size-cap pass (anything over ~8KB), so the sky would
                    // "work" until the next Save + reload, then vanish.
                    void (async () => {
                      try {
                        const form = new FormData();
                        form.append('file', f);
                        form.append('kind', 'bg');
                        const res = await fetch('/api/admin/upload-site-image', {
                          method: 'POST',
                          body: form,
                        });
                        const data = (await res.json()) as { url?: string; error?: string };
                        if (!res.ok || !data.url) {
                          toast({
                            title: 'Sky upload failed',
                            description: data.error || 'Try a smaller image.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        patchEnv({ sky: 'custom', skyTextureUrl: data.url });
                      } catch {
                        toast({
                          title: 'Sky upload failed',
                          description: 'Network error, try again.',
                          variant: 'destructive',
                        });
                      }
                    })();
                  }}
                />
                {env.skyTextureUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs text-red-300"
                    onClick={() => patchEnv({ skyTextureUrl: undefined })}
                  >
                    Clear sky texture
                  </Button>
                )}
                <p className="text-[10px] text-white/35">
                  Panorama / equirectangular works best. JPG/PNG under ~2 MB.
                </p>
              </div>
              <label className="block text-xs text-white/60">
                Horizon / ground tint
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.horizonColor || env.fogColor}
                  onChange={(e) => patchEnv({ horizonColor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Fog color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.fogColor}
                  onChange={(e) => patchEnv({ fogColor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Fog density ({env.fogDensity.toFixed(3)})
                <input
                  type="range"
                  min={0}
                  max={0.08}
                  step={0.002}
                  className="w-full"
                  value={env.fogDensity}
                  onChange={(e) => patchEnv({ fogDensity: Number(e.target.value) })}
                />
              </label>
              <p className="text-[10px] tracking-widest text-white/50 uppercase pt-1">Lighting</p>
              <label className="block text-xs text-white/60">
                Ambient ({(env.ambientIntensity ?? 0.55).toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  className="w-full"
                  value={env.ambientIntensity ?? 0.55}
                  onChange={(e) => patchEnv({ ambientIntensity: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Sun intensity ({(env.sunIntensity ?? 1.15).toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.05}
                  className="w-full"
                  value={env.sunIntensity ?? 1.15}
                  onChange={(e) => patchEnv({ sunIntensity: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Sun color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.sunColor || '#fff4e0'}
                  onChange={(e) => patchEnv({ sunColor: e.target.value })}
                />
              </label>
              <p className="text-[10px] tracking-widest text-white/50 uppercase pt-2">Floor type</p>
              <select
                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5"
                value={env.floor}
                onChange={(e) => patchEnv({ floor: e.target.value as FloorPreset })}
              >
                <option value="grid">Grid</option>
                <option value="solid">Solid</option>
                <option value="water">Water</option>
                <option value="void">Void (none)</option>
              </select>
              <label className="block text-xs text-white/60">
                Floor color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.floorColor}
                  onChange={(e) => patchEnv({ floorColor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Floor texture tile ({env.floorTextureScale ?? 40})
                <input
                  type="range"
                  min={4}
                  max={120}
                  step={1}
                  className="w-full"
                  value={env.floorTextureScale ?? 40}
                  onChange={(e) => patchEnv({ floorTextureScale: Number(e.target.value) })}
                />
              </label>
              <p className="text-[10px] tracking-widest text-white/50 uppercase pt-2">
                Editor view
              </p>
              <label className="flex items-center justify-between gap-3 text-xs text-white/70 select-none cursor-pointer">
                <span>Show editing grid</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={env.gridVisible ?? true}
                  onChange={(e) => patchEnv({ gridVisible: e.target.checked })}
                />
              </label>
              <p className="text-[10px] text-white/35 leading-snug">
                Toggle the grid overlay off to preview the in-game floor style (solid / void / water) without grid lines on top.
              </p>
              <p className="text-[10px] tracking-widest text-amber-300/80 uppercase pt-2">
                Editor performance
              </p>
              <p className="text-[10px] text-white/35 leading-snug">
                Cut rendering work while editing a heavy map. Play Test and live matches are unaffected and still render everything at full quality.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                onClick={() => {
                  const next = { ...LARGE_MAP_EDITOR_PERF_MODE };
                  setEditorPerf(next);
                  apiRef.current?.setEditorPerfMode(next);
                  toast({
                    title: 'Large-map performance on',
                    description:
                      'Bloom, sky texture, fog, void glow, and collision wires are off in the editor only. Play Test stays full quality.',
                  });
                }}
              >
                Large map preset
              </Button>
              {(
                [
                  ['disableBloom', 'Disable bloom (biggest GPU saving)'],
                  ['capPixelRatio', 'Render at 1x pixel ratio'],
                  ['skipCollisionGizmos', 'Skip collision wireframes'],
                  ['hideFloor', 'Hide floor / void disc'],
                  ['hideSkyTexture', 'Hide sky texture (solid color)'],
                  ['hideVoidEffects', 'Hide void glow / shadow'],
                  ['hideFog', 'Hide fog'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 text-xs text-white/70 select-none cursor-pointer"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-400"
                    checked={editorPerf[key]}
                    onChange={(e) => {
                      const next = { ...editorPerf, [key]: e.target.checked };
                      setEditorPerf(next);
                      apiRef.current?.setEditorPerfMode(next);
                    }}
                  />
                </label>
              ))}
              {(Object.keys(DEFAULT_EDITOR_PERF_MODE) as (keyof typeof DEFAULT_EDITOR_PERF_MODE)[]).some(
                (key) => editorPerf[key] !== DEFAULT_EDITOR_PERF_MODE[key]
              ) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs text-amber-200"
                  onClick={() => {
                    const next = { ...DEFAULT_EDITOR_PERF_MODE };
                    setEditorPerf(next);
                    apiRef.current?.setEditorPerfMode(next);
                  }}
                >
                  Restore all editor visuals
                </Button>
              )}
              {env.floor === 'void' && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                  <p className="text-[10px] tracking-widest text-emerald-300/80 uppercase">
                    Void atmosphere
                  </p>

                  <label className="block text-xs text-white/60">
                    Void sky tint (base abyss color)
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        className="h-9 w-20 shrink-0 bg-transparent"
                        value={env.voidColor || '#050810'}
                        onChange={(e) => patchEnv({ voidColor: e.target.value })}
                      />
                      <div className="flex-1 text-[10px] text-white/50 font-mono">
                        {env.voidColor || '#050810'}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[10px] text-white/50 hover:text-white"
                        onClick={() => patchEnv({ voidColor: undefined })}
                      >
                        Reset
                      </Button>
                    </div>
                  </label>

                  <label className="block text-xs text-white/60">
                    Void floor disc (painted ground)
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        className="h-9 w-20 shrink-0 bg-transparent"
                        value={env.voidFloorColor ?? env.voidColor ?? '#0a2412'}
                        onChange={(e) => patchEnv({ voidFloorColor: e.target.value })}
                      />
                      <div className="flex-1 text-[10px] text-white/50 font-mono">
                        {env.voidFloorColor ?? '(inherits sky)'}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[10px] text-white/50 hover:text-white"
                        onClick={() =>
                          patchEnv({ voidFloorColor: undefined, voidFloorOpacity: undefined })
                        }
                      >
                        Match sky
                      </Button>
                    </div>
                  </label>

                  <label className="block text-xs text-white/60">
                    Floor opacity ({Math.round((env.voidFloorOpacity ?? 0.9) * 100)}%)
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-full"
                      value={env.voidFloorOpacity ?? 0.9}
                      onChange={(e) =>
                        patchEnv({ voidFloorOpacity: Number(e.target.value) })
                      }
                    />
                    <p className="text-[10px] text-white/35 leading-snug mt-0.5">
                      Lower to let the glowing void fog show through the floor disc (pure abyss feel).
                    </p>
                  </label>

                  <div className="pt-2 border-t border-white/10 space-y-3">
                    <p className="text-[10px] tracking-widest text-emerald-300/80 uppercase">
                      Void fog &amp; abyss shadow
                    </p>

                    <label className="block text-xs text-white/60">
                      Fog color (falling shadow tint)
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          className="h-9 w-20 shrink-0 bg-transparent"
                          value={env.voidFogColor ?? '#26c05d'}
                          onChange={(e) => patchEnv({ voidFogColor: e.target.value })}
                        />
                        <div className="flex-1 text-[10px] text-white/50 font-mono">
                          {env.voidFogColor ?? '(global fog)'}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] text-white/50 hover:text-white"
                          onClick={() =>
                            patchEnv({ voidFogColor: undefined, voidFogDensity: undefined })
                          }
                        >
                          Use global
                        </Button>
                      </div>
                    </label>

                    <label className="block text-xs text-white/60">
                      Fog density · how far you can see down (
                      {(env.voidFogDensity ?? 0.05).toFixed(3)})
                      <input
                        type="range"
                        min={0}
                        max={0.18}
                        step={0.001}
                        className="w-full"
                        value={env.voidFogDensity ?? 0.05}
                        onChange={(e) =>
                          patchEnv({ voidFogDensity: Number(e.target.value) })
                        }
                      />
                      <p className="text-[10px] text-white/35 leading-snug mt-0.5">
                        Higher density = the abyss eats platforms sooner as they recede from the camera.
                      </p>
                    </label>

                    <label className="block text-xs text-white/60">
                      Glow shadow halo color
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          className="h-9 w-20 shrink-0 bg-transparent"
                          value={env.voidShadowColor ?? env.voidFogColor ?? '#65ffa9'}
                          onChange={(e) => patchEnv({ voidShadowColor: e.target.value })}
                        />
                        <div className="flex-1 text-[10px] text-white/50 font-mono">
                          {env.voidShadowColor ?? '(matches fog)'}
                        </div>
                      </div>
                    </label>

                    <label className="block text-xs text-white/60">
                      Shadow glow intensity (
                      {Number((env.voidShadowIntensity ?? 1.1).toFixed(2))})
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.01}
                        className="w-full"
                        value={env.voidShadowIntensity ?? 1.1}
                        onChange={(e) =>
                          patchEnv({ voidShadowIntensity: Number(e.target.value) })
                        }
                      />
                      <p className="text-[10px] text-white/35 leading-snug mt-0.5">
                        0 = no halo glow at all, 2 = neon-max abyss glow under every platform.
                      </p>
                    </label>
                  </div>
                </div>
              )}
            </div>
  );
}

export const worldPlugin: MapEditorPlugin = {
  id: 'world',
  slot: 'sidebar',
  label: 'World',
  icon: CloudSun,
  order: 50,
  render: (brains) => <WorldPanel brains={brains} />,
};
