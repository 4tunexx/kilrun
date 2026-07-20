'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  PersonStanding,
  Upload,
  X,
  Play,
  Wand2,
  RefreshCw,
  Crosshair,
  Bone,
  CirclePlus,
  CircleMinus,
  Circle,
  Square,
  Palette,
  Disc3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  EditorEntity,
  PlayerAnimSlot,
  PlayerAuthoredClip,
  PlayerExtraBone,
  PlayerMeshEdits,
} from './map-document';
import {
  PLAYER_ANIM_SLOTS,
  ensureAnimation,
  suggestPlayerBindings,
} from './map-document';
import { PROTOTYPE_MODELS } from './prototype-catalog';
import {
  applyClipsToPlayerEntity,
  loadPlayerAvatar,
} from './player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import {
  applyExtraBones,
  applyPlayerMeshEdits,
  authoredClipsToThree,
  bakeTimelineToClip,
  listBones,
  listMeshes,
  removeExtraBone,
} from './player-mesh-edits';

type StudioTab = 'model' | 'mesh' | 'bones' | 'record' | 'anims';

type TimelineKey = {
  time: number;
  position: number[];
  quaternion: number[];
  scale: number[];
};

/**
 * Side panel beside the map: inspect player model, edit body parts / colors,
 * select bones, record bone animations to a timeline, bind clips.
 */
export function PlayerModelStudio({
  entity,
  onChange,
  onClose,
  onFocusInMap,
  isMobile,
}: {
  entity: EditorEntity;
  onChange: (patch: Partial<EditorEntity>) => void;
  onClose: () => void;
  onFocusInMap?: () => void;
  isMobile?: boolean;
}) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<StudioPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipCount, setClipCount] = useState(0);
  const [previewSlot, setPreviewSlot] = useState<PlayerAnimSlot | 'clip' | null>(null);
  const [tab, setTab] = useState<StudioTab>('model');
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [meshNames, setMeshNames] = useState<string[]>([]);
  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  const [selectedMesh, setSelectedMesh] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [timelineTime, setTimelineTime] = useState(0);
  const [timelineKeys, setTimelineKeys] = useState<TimelineKey[]>([]);
  const [clipName, setClipName] = useState('custom_move');
  const [boneScale, setBoneScale] = useState<[number, number, number]>([1, 1, 1]);
  const [meshColor, setMeshColor] = useState('#c4a574');

  const anim = ensureAnimation(entity);
  const clips = anim.availableClips;
  const bindings = entity.playerAnims ?? {};
  const meshEdits = entity.playerMeshEdits ?? {};
  const extraBones = entity.playerExtraBones ?? [];
  const authoredClips = entity.playerAuthoredClips ?? [];

  const refreshLists = () => {
    const bones = previewRef.current?.getBoneNames() ?? [];
    const meshes = previewRef.current?.getMeshNames() ?? [];
    setBoneNames(bones);
    setMeshNames(meshes);
  };

  // Load / reload 3D preview when model source changes
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadPlayerAvatar(entity);
        if (cancelled) return;

        const patch = applyClipsToPlayerEntity(entity, loaded.clipNames, true);
        const prevClips = entity.animation?.availableClips ?? [];
        const clipsChanged =
          prevClips.length !== loaded.clipNames.length ||
          prevClips.some((c, i) => c !== loaded.clipNames[i]);
        const bindingsEmpty = !entity.playerAnims || Object.keys(entity.playerAnims).length === 0;
        if (clipsChanged || (bindingsEmpty && patch.playerAnims)) {
          onChange(patch);
        }
        setClipCount(loaded.clipNames.length);

        if (!previewRef.current) {
          previewRef.current = new StudioPreview(host);
        }
        previewRef.current.setAvatar(loaded.scene, loaded.animations);
        applyExtraBones(loaded.scene, entity.playerExtraBones);
        applyPlayerMeshEdits(loaded.scene, entity.playerMeshEdits);
        refreshLists();
        const idleClip = (patch.playerAnims ?? bindings).idle ?? loaded.clipNames[0];
        if (idleClip) previewRef.current.playClip(idleClip, true);
      } catch (err) {
        console.warn('[PlayerModelStudio]', err);
        if (!cancelled) setError('Failed to load model');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.model, entity.customModelUrl, entity.id]);

  useEffect(() => {
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewRef.current?.setSelectedBone(selectedBone);
    if (selectedBone) {
      const s = previewRef.current?.getBoneScale(selectedBone) ?? [1, 1, 1];
      setBoneScale(s);
    }
  }, [selectedBone]);

  useEffect(() => {
    previewRef.current?.setTransformEnabled(recording && Boolean(selectedBone));
  }, [recording, selectedBone]);

  const setBinding = (slot: PlayerAnimSlot, clip: string | undefined) => {
    onChange({
      playerAnims: { ...bindings, [slot]: clip || undefined },
    });
  };

  const playSlot = (slot: PlayerAnimSlot) => {
    const clip = bindings[slot] || bindings.idle;
    if (!clip) return;
    setPreviewSlot(slot);
    const loop = slot !== 'die' && slot !== 'land' && slot !== 'jump';
    previewRef.current?.playClip(clip, loop);
  };

  const playRawClip = (clip: string) => {
    setPreviewSlot('clip');
    previewRef.current?.playClip(clip, true);
  };

  const patchMeshEdits = (partial: PlayerMeshEdits) => {
    const next: PlayerMeshEdits = {
      meshColors: { ...meshEdits.meshColors, ...partial.meshColors },
      meshScales: { ...meshEdits.meshScales, ...partial.meshScales },
      boneScales: { ...meshEdits.boneScales, ...partial.boneScales },
    };
    onChange({ playerMeshEdits: next });
    previewRef.current?.applyEdits(next);
  };

  const addBone = () => {
    const parentName = selectedBone || boneNames[0];
    if (!parentName) return;
    const name = `extra_${Date.now().toString(36).slice(-4)}`;
    const bone: PlayerExtraBone = {
      name,
      parentName,
      position: [0.15, 0, 0],
    };
    const next = [...extraBones, bone];
    onChange({ playerExtraBones: next });
    previewRef.current?.addExtraBone(bone);
    refreshLists();
    setSelectedBone(name);
  };

  const deleteSelectedBone = () => {
    if (!selectedBone) return;
    const isExtra = extraBones.some((b) => b.name === selectedBone);
    if (!isExtra) return;
    onChange({ playerExtraBones: extraBones.filter((b) => b.name !== selectedBone) });
    previewRef.current?.removeExtra(selectedBone);
    setSelectedBone(null);
    refreshLists();
  };

  const addTimelineKey = () => {
    if (!selectedBone) return;
    const pose = previewRef.current?.captureBonePose(selectedBone);
    if (!pose) return;
    setTimelineKeys((prev) => {
      const without = prev.filter((k) => Math.abs(k.time - timelineTime) > 0.001);
      return [...without, { time: timelineTime, ...pose }].sort((a, b) => a.time - b.time);
    });
  };

  const saveRecordedClip = () => {
    if (!selectedBone || timelineKeys.length < 1) return;
    const clip = bakeTimelineToClip(
      clipName.trim() || 'custom_move',
      selectedBone,
      timelineKeys
    );
    const nextAuthored = [
      ...authoredClips.filter((c) => c.name !== clip.name),
      clip,
    ];
    const threeClips = authoredClipsToThree([clip]);
    previewRef.current?.registerClips(threeClips);
    const allNames = Array.from(
      new Set([...(entity.animation?.availableClips ?? clips), clip.name])
    );
    onChange({
      playerAuthoredClips: nextAuthored,
      animation: {
        ...(entity.animation ?? ensureAnimation(entity)),
        availableClips: allNames,
      },
    });
    setClipCount(allNames.length);
    setRecording(false);
    previewRef.current?.playClip(clip.name, true);
    setPreviewSlot('clip');
  };

  const tabs: { id: StudioTab; label: string }[] = [
    { id: 'model', label: 'Model' },
    { id: 'mesh', label: 'Mesh' },
    { id: 'bones', label: 'Bones' },
    { id: 'record', label: 'Record' },
    { id: 'anims', label: 'Anims' },
  ];

  return (
    <aside
      className={`flex flex-col bg-[#0e1520] border-white/10 text-white shadow-2xl z-[90] ${
        isMobile
          ? 'absolute inset-0 border-0'
          : 'relative w-[min(100%,420px)] shrink-0 border-l'
      }`}
      aria-label="Player Model studio"
    >
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-white/10 bg-[#121a24]">
        <PersonStanding className="w-4 h-4 text-sky-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide uppercase text-sky-200 truncate">
            Player Model
          </p>
          <p className="text-[10px] text-white/45 truncate">
            Mesh · bones · record · bind
          </p>
        </div>
        {onFocusInMap && (
          <button
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10"
            title="Focus avatar in map"
            onClick={onFocusInMap}
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10 min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
          title="Close studio"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="relative shrink-0 h-44 sm:h-52 bg-gradient-to-b from-[#152033] to-[#0a1018] border-b border-white/10">
        <div ref={canvasHostRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/70">
            Loading model…
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 bottom-0 p-2 text-[11px] text-red-300 bg-black/50">
            {error}
          </div>
        )}
        {previewSlot && (
          <div className="absolute top-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
            {previewSlot === 'clip' ? 'Clip' : previewSlot}
          </div>
        )}
        {recording && (
          <div className="absolute top-2 right-2 rounded-md bg-rose-600/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white flex items-center gap-1">
            <Disc3 className="w-3 h-3" /> Recording {selectedBone || '—'}
          </div>
        )}
      </div>

      <div className="shrink-0 flex border-b border-white/10 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[4.2rem] py-2 text-[10px] font-bold uppercase tracking-wide ${
              tab === t.id
                ? 'bg-sky-500/20 text-sky-100 border-b-2 border-sky-400'
                : 'text-white/45 hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === 'model' && (
          <>
            <label className="block text-xs text-white/60">
              Display name
              <input
                className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                value={entity.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </label>

            <div className="space-y-1.5">
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Model</p>
              <label className="block text-xs text-white/60">
                Catalog / mannequin
                <select
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                  value={entity.customModelUrl ? '__custom__' : entity.model ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') return;
                    if (v === '') {
                      onChange({ model: undefined, customModelUrl: undefined });
                    } else {
                      onChange({ model: v, customModelUrl: undefined });
                    }
                  }}
                >
                  <option value="">Default mannequin (full anim pack)</option>
                  {entity.customModelUrl && <option value="__custom__">Custom upload</option>}
                  {PROTOTYPE_MODELS.filter(
                    (m) =>
                      m.includes('figurine') || m.includes('character') || m.includes('person')
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <optgroup label="All props">
                    {PROTOTYPE_MODELS.slice(0, 80).map((m) => (
                      <option key={`all-${m}`} value={m}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 min-h-10"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" /> Upload GLB
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-10 px-3"
                  title="Reload preview"
                  onClick={() => {
                    previewRef.current?.dispose();
                    previewRef.current = null;
                    const host = canvasHostRef.current;
                    if (host) {
                      void loadPlayerAvatar(entity).then((loaded) => {
                        previewRef.current = new StudioPreview(host);
                        previewRef.current.setAvatar(loaded.scene, loaded.animations);
                        setClipCount(loaded.clipNames.length);
                        refreshLists();
                        const idle = bindings.idle ?? loaded.clipNames[0];
                        if (idle) previewRef.current.playClip(idle, true);
                      });
                    }
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".glb,.gltf,model/gltf-binary"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    onChange({
                      customModelUrl: String(reader.result),
                      model: undefined,
                      name: entity.name || f.name.replace(/\.(glb|gltf)$/i, ''),
                      playerAnims: {},
                    });
                  };
                  reader.readAsDataURL(f);
                  e.target.value = '';
                }}
              />
            </div>

            <label className="block text-xs text-white/60">
              Scale ({entity.scale[1].toFixed(2)})
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                className="w-full"
                value={entity.scale[1]}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  onChange({ scale: [s, s, s] });
                  previewRef.current?.setUniformScale(s);
                }}
              />
            </label>
          </>
        )}

        {tab === 'mesh' && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/45 leading-snug">
              Select a body mesh to recolor, or a bone (Bones tab) to round / squeeze / resize that
              body part.
            </p>
            <label className="block text-xs text-white/60">
              Body mesh
              <select
                className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                value={selectedMesh ?? ''}
                onChange={(e) => setSelectedMesh(e.target.value || null)}
              >
                <option value="">—</option>
                {meshNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {selectedMesh && (
              <label className="block text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <Palette className="w-3 h-3" /> Color
                </span>
                <input
                  type="color"
                  className="mt-0.5 block w-full h-10 rounded cursor-pointer bg-transparent border border-white/10"
                  value={meshColor}
                  onChange={(e) => {
                    setMeshColor(e.target.value);
                    patchMeshEdits({ meshColors: { [selectedMesh]: e.target.value } });
                  }}
                />
              </label>
            )}
            {selectedBone && (
              <div className="space-y-2 rounded-lg border border-amber-400/25 bg-amber-500/5 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-amber-100/90 font-bold">
                  Body part size — {selectedBone}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="flex-1 py-1.5 rounded-md text-[10px] font-bold border border-white/10"
                    onClick={() => {
                      const next: [number, number, number] = [1.15, 1.15, 1.15];
                      setBoneScale(next);
                      previewRef.current?.setBoneScale(selectedBone, next);
                      patchMeshEdits({ boneScales: { [selectedBone]: next } });
                    }}
                  >
                    <Circle className="w-3 h-3 inline mr-1" />
                    Round+
                  </button>
                  <button
                    type="button"
                    className="flex-1 py-1.5 rounded-md text-[10px] font-bold border border-white/10"
                    onClick={() => {
                      const next: [number, number, number] = [1.35, 0.75, 1.0];
                      setBoneScale(next);
                      previewRef.current?.setBoneScale(selectedBone, next);
                      patchMeshEdits({ boneScales: { [selectedBone]: next } });
                    }}
                  >
                    <Square className="w-3 h-3 inline mr-1" />
                    Squeeze
                  </button>
                  <button
                    type="button"
                    className="flex-1 py-1.5 rounded-md text-[10px] font-bold border border-white/10"
                    onClick={() => {
                      const next: [number, number, number] = [1, 1, 1];
                      setBoneScale(next);
                      previewRef.current?.setBoneScale(selectedBone, next);
                      patchMeshEdits({ boneScales: { [selectedBone]: next } });
                    }}
                  >
                    Reset
                  </button>
                </div>
                {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                  <label key={axis} className="flex items-center gap-2 text-[10px] text-white/50">
                    <span className="w-4">{axis}</span>
                    <input
                      type="range"
                      min={0.4}
                      max={2.2}
                      step={0.02}
                      value={boneScale[i]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        const next: [number, number, number] = [...boneScale];
                        next[i] = v;
                        setBoneScale(next);
                        previewRef.current?.setBoneScale(selectedBone, next);
                        patchMeshEdits({ boneScales: { [selectedBone]: next } });
                      }}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="w-8 text-right tabular-nums">{boneScale[i].toFixed(2)}</span>
                  </label>
                ))}
              </div>
            )}
            {!selectedBone && (
              <p className="text-[10px] text-white/40">
                Tip: open the Bones tab and select an arm / leg / head bone to resize that part.
              </p>
            )}
          </div>
        )}

        {tab === 'bones' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-[10px] tracking-widest text-white/50 uppercase flex-1">
                Skeleton ({boneNames.length})
              </p>
              <button
                type="button"
                title="Add helper bone under selected"
                onClick={addBone}
                className="w-8 h-8 rounded-lg bg-emerald-600/35 hover:bg-emerald-500/45 flex items-center justify-center"
              >
                <CirclePlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Remove selected helper bone"
                disabled={!selectedBone || !extraBones.some((b) => b.name === selectedBone)}
                onClick={deleteSelectedBone}
                className="w-8 h-8 rounded-lg bg-rose-600/35 hover:bg-rose-500/45 disabled:opacity-30 flex items-center justify-center"
              >
                <CircleMinus className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
              {boneNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setSelectedBone(name);
                    setTab('record');
                  }}
                  className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-1.5 ${
                    selectedBone === name
                      ? 'bg-sky-500/25 text-sky-50'
                      : 'text-white/65 hover:bg-white/5'
                  }`}
                >
                  <Bone className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">{name}</span>
                  {extraBones.some((b) => b.name === name) && (
                    <span className="ml-auto text-[9px] text-emerald-300/80">extra</span>
                  )}
                </button>
              ))}
              {!boneNames.length && (
                <p className="p-2 text-[11px] text-amber-200/80">
                  No bones found — upload a skinned GLB or use the default mannequin.
                </p>
              )}
            </div>
            <p className="text-[10px] text-white/40 leading-snug">
              Select a bone, then open Record: press Record → move the bone → Add to timeline.
              Only the selected bone is keyed.
            </p>
          </div>
        )}

        {tab === 'record' && (
          <div className="space-y-3">
            <label className="block text-xs text-white/60">
              Selected bone
              <select
                className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                value={selectedBone ?? ''}
                onChange={(e) => setSelectedBone(e.target.value || null)}
              >
                <option value="">— pick a bone —</option>
                {boneNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <Button
                size="sm"
                className={`flex-1 min-h-10 ${
                  recording ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
                }`}
                disabled={!selectedBone}
                onClick={() => {
                  const next = !recording;
                  setRecording(next);
                  if (next) {
                    previewRef.current?.stopMixer();
                    setTimelineKeys((keys) =>
                      keys.length
                        ? keys
                        : [
                            {
                              time: 0,
                              ...(previewRef.current?.captureBonePose(selectedBone!) ?? {
                                position: [0, 0, 0],
                                quaternion: [0, 0, 0, 1],
                                scale: [1, 1, 1],
                              }),
                            },
                          ]
                    );
                    setTimelineTime(0);
                  }
                }}
              >
                <Disc3 className="w-3.5 h-3.5 mr-1" />
                {recording ? 'Stop record' : 'Record'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 min-h-10"
                disabled={!recording || !selectedBone}
                onClick={addTimelineKey}
              >
                Add to timeline
              </Button>
            </div>

            <label className="block text-xs text-white/60">
              Timeline time ({timelineTime.toFixed(2)}s)
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={timelineTime}
                onChange={(e) => setTimelineTime(Number(e.target.value))}
                className="w-full accent-fuchsia-400"
              />
            </label>

            <div className="rounded-lg border border-white/10 bg-black/25 p-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-white/45">
                Keys ({timelineKeys.length}) — bone only
              </p>
              {timelineKeys.map((k) => (
                <div
                  key={`${k.time}`}
                  className="flex items-center gap-2 text-[10px] text-white/60"
                >
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setTimelineTime(k.time);
                      previewRef.current?.applyBonePose(selectedBone!, k);
                    }}
                  >
                    t={k.time.toFixed(2)}s
                  </button>
                  <button
                    type="button"
                    className="ml-auto text-rose-300"
                    onClick={() =>
                      setTimelineKeys((prev) => prev.filter((x) => x.time !== k.time))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!timelineKeys.length && (
                <p className="text-[10px] text-white/35">
                  No keys yet — Record, move the gizmo, then Add to timeline.
                </p>
              )}
            </div>

            <label className="block text-xs text-white/60">
              Clip name
              <input
                className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                value={clipName}
                onChange={(e) => setClipName(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              className="w-full min-h-10 bg-emerald-600 hover:bg-emerald-500"
              disabled={timelineKeys.length < 1 || !selectedBone}
              onClick={saveRecordedClip}
            >
              Save clip to avatar
            </Button>
            <p className="text-[10px] text-white/40 leading-snug">
              Workflow: select bone → Record → drag gizmo to pose → Add to timeline at each time →
              Save clip. Only that bone is keyed (arm swing won&apos;t bake the whole body).
            </p>
          </div>
        )}

        {tab === 'anims' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">
                  Animations ({clipCount || clips.length} clips)
                </p>
                {clips.length > 0 && (
                  <button
                    type="button"
                    className="text-[10px] flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                    onClick={() => onChange({ playerAnims: suggestPlayerBindings(clips) })}
                  >
                    <Wand2 className="w-3 h-3" /> Auto-bind
                  </button>
                )}
              </div>

              {!clips.length && !loading ? (
                <p className="text-[11px] text-amber-200/80">
                  No clips yet — pick the mannequin, upload an animated GLB, or Record a bone clip.
                </p>
              ) : (
                PLAYER_ANIM_SLOTS.map(({ id, label, hint }) => (
                  <div key={id} className="flex items-end gap-1.5">
                    <label className="flex-1 block text-xs text-white/60 min-w-0">
                      <span className="flex items-baseline gap-1.5">
                        <span>{label}</span>
                        {hint && (
                          <span className="text-[9px] text-white/35 truncate">{hint}</span>
                        )}
                      </span>
                      <select
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                        value={bindings[id] ?? ''}
                        onChange={(e) => setBinding(id, e.target.value || undefined)}
                        disabled={!clips.length}
                      >
                        <option value="">—</option>
                        {clips.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      title={`Preview ${label}`}
                      disabled={!bindings[id] && !bindings.idle}
                      className="shrink-0 w-9 h-9 rounded-lg bg-cyan-600/35 hover:bg-cyan-500/45 disabled:opacity-30 flex items-center justify-center"
                      onClick={() => playSlot(id)}
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {clips.length > 0 && (
              <div className="space-y-1.5 border-t border-white/10 pt-2">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">All clips</p>
                <div className="flex flex-wrap gap-1.5">
                  {clips.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="text-[10px] px-2 py-1 rounded-md bg-white/8 hover:bg-white/15 border border-white/10 truncate max-w-full"
                      onClick={() => playRawClip(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {authoredClips.length > 0 && (
              <div className="space-y-1.5 border-t border-white/10 pt-2">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">
                  Recorded clips
                </p>
                {authoredClips.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      className="text-cyan-200 underline"
                      onClick={() => playRawClip(c.name)}
                    >
                      {c.name}
                    </button>
                    <span className="text-white/35">{c.duration.toFixed(2)}s</span>
                    <button
                      type="button"
                      className="ml-auto text-rose-300"
                      onClick={() => {
                        onChange({
                          playerAuthoredClips: authoredClips.filter((x) => x.name !== c.name),
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/** Tiny Three.js turntable preview for the studio panel. */
class StudioPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private avatarRoot: THREE.Object3D | null = null;
  private baseScale = 1;
  private userScale = 1;
  private raf = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private pivot = new THREE.Group();
  private transform: TransformControls | null = null;
  private transformHelper: THREE.Object3D | null = null;
  private boneHelper: THREE.SkeletonHelper | null = null;
  private selectedBone: THREE.Object3D | null = null;
  private autoSpin = true;

  constructor(host: HTMLElement) {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    Object.assign(this.renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
    });
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.05, 50);
    this.camera.position.set(0, 1.35, 3.2);
    this.camera.lookAt(0, 0.85, 0);

    this.scene.background = null;
    const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x1a1520, 1.1);
    const key = new THREE.DirectionalLight(0xfff2dd, 1.2);
    key.position.set(2, 4, 3);
    this.scene.add(hemi, key, this.pivot);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.9, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setMode('rotate');
    this.transform.setSize(0.85);
    this.transform.enabled = false;
    this.transform.addEventListener('dragging-changed', (ev) => {
      const dragging = Boolean((ev as unknown as { value?: boolean }).value);
      this.autoSpin = !dragging;
    });
    this.transformHelper =
      typeof (this.transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper ===
      'function'
        ? (this.transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
        : (this.transform as unknown as THREE.Object3D);
    this.transformHelper.visible = false;
    this.scene.add(this.transformHelper);

    const ro = new ResizeObserver(() => {
      if (this.disposed) return;
      const nw = Math.max(1, host.clientWidth);
      const nh = Math.max(1, host.clientHeight);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(nw, nh, false);
    });
    ro.observe(host);
    (this as unknown as { _ro: ResizeObserver })._ro = ro;

    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.autoSpin && !this.transform?.dragging) this.pivot.rotation.y += dt * 0.35;
      this.mixer?.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  setAvatar(scene: THREE.Object3D, animations: THREE.AnimationClip[]) {
    if (this.avatarRoot) {
      this.pivot.remove(this.avatarRoot);
      this.avatarRoot = null;
    }
    if (this.boneHelper) {
      this.boneHelper.removeFromParent();
      this.boneHelper = null;
    }
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    this.current = '';
    this.selectedBone = null;
    this.transform?.detach();

    normalizeCharacter(scene, 1.75);
    this.baseScale = scene.scale.x || 1;
    scene.scale.setScalar(this.baseScale * this.userScale);
    this.avatarRoot = scene;
    this.pivot.add(scene);

    const bones = listBones(scene);
    if (bones.length) {
      this.boneHelper = new THREE.SkeletonHelper(scene);
      this.boneHelper.visible = true;
      this.scene.add(this.boneHelper);
    }

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of animations) {
      const name = clip.name || '(unnamed)';
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(name, action);
    }
  }

  registerClips(clips: THREE.AnimationClip[]) {
    if (!this.mixer || !this.avatarRoot) return;
    for (const clip of clips) {
      const name = clip.name || '(unnamed)';
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(name, action);
    }
  }

  getBoneNames(): string[] {
    if (!this.avatarRoot) return [];
    return listBones(this.avatarRoot).map((b) => b.name).filter(Boolean);
  }

  getMeshNames(): string[] {
    if (!this.avatarRoot) return [];
    return listMeshes(this.avatarRoot)
      .map((m) => m.name)
      .filter(Boolean);
  }

  setSelectedBone(name: string | null) {
    if (!this.avatarRoot) return;
    this.selectedBone = name ? this.avatarRoot.getObjectByName(name) ?? null : null;
    if (this.selectedBone && this.transform) {
      this.transform.attach(this.selectedBone);
    } else {
      this.transform?.detach();
    }
  }

  setTransformEnabled(on: boolean) {
    if (!this.transform) return;
    this.transform.enabled = on;
    if (this.transformHelper) this.transformHelper.visible = on;
    this.autoSpin = !on;
    if (on) this.transform.setMode('rotate');
  }

  getBoneScale(name: string): [number, number, number] {
    const bone = this.avatarRoot?.getObjectByName(name);
    if (!bone) return [1, 1, 1];
    return [bone.scale.x, bone.scale.y, bone.scale.z];
  }

  setBoneScale(name: string, scale: [number, number, number]) {
    const bone = this.avatarRoot?.getObjectByName(name);
    if (bone) bone.scale.set(...scale);
  }

  applyEdits(edits: PlayerMeshEdits) {
    if (this.avatarRoot) applyPlayerMeshEdits(this.avatarRoot, edits);
  }

  addExtraBone(bone: PlayerExtraBone) {
    if (!this.avatarRoot) return;
    applyExtraBones(this.avatarRoot, [bone]);
  }

  removeExtra(name: string) {
    if (!this.avatarRoot) return;
    removeExtraBone(this.avatarRoot, name);
    if (this.selectedBone?.name === name) {
      this.selectedBone = null;
      this.transform?.detach();
    }
  }

  captureBonePose(name: string) {
    const bone = this.avatarRoot?.getObjectByName(name);
    if (!bone) return null;
    return {
      position: [bone.position.x, bone.position.y, bone.position.z],
      quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
      scale: [bone.scale.x, bone.scale.y, bone.scale.z],
    };
  }

  applyBonePose(
    name: string,
    pose: { position: number[]; quaternion: number[]; scale: number[] }
  ) {
    const bone = this.avatarRoot?.getObjectByName(name);
    if (!bone) return;
    bone.position.set(pose.position[0], pose.position[1], pose.position[2]);
    bone.quaternion.set(
      pose.quaternion[0],
      pose.quaternion[1],
      pose.quaternion[2],
      pose.quaternion[3]
    );
    bone.scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
  }

  setUniformScale(s: number) {
    this.userScale = s;
    if (this.avatarRoot) {
      this.avatarRoot.scale.setScalar(this.baseScale * s);
    }
  }

  stopMixer() {
    this.mixer?.stopAllAction();
    this.current = '';
  }

  playClip(name: string, loop: boolean) {
    const next = this.actions.get(name);
    if (!next) return;
    if (this.current === name && next.isRunning()) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    prev?.fadeOut(0.12);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(0.12).play();
    this.current = name;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mixer?.stopAllAction();
    this.transform?.dispose();
    const ro = (this as unknown as { _ro?: ResizeObserver })._ro;
    ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
