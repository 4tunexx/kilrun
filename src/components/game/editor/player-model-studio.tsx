'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  PersonStanding,
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
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type {
  EditorEntity,
  PlayerAnimSlot,
  PlayerExtraBone,
  PlayerMeshEdits,
} from './map-document';
import {
  PLAYER_ANIM_SLOTS,
  ensureAnimation,
  suggestPlayerBindings,
} from './map-document';
import { CharacterAssetPicker } from './character-asset-picker';
import { siteOrEngineFetch } from '@/lib/engine/platform-client';
import {
  applyClipsToPlayerEntity,
  loadPlayerAvatar,
  migratePlayerEntityToPackBlue,
} from './player-avatar';
import { DEFAULT_PACK_PLAYER_URL } from '../renderer/pack-player';
import { normalizeCharacter } from '../renderer/asset-loader';
import { disposeClonedMaterials } from './editor-mesh';
import {
  applyExtraBones,
  applyPlayerMeshEdits,
  authoredClipsToThree,
  bakeTimelineToClip,
  listBones,
  listMeshes,
  removeExtraBone,
} from './player-mesh-edits';
import { loadAnimatedPrefab } from './model-scan';
import { listClipBones, retargetClip } from './mixamo-import';
import { defaultCustomMove, type CustomMoveDef } from '@shared/custom-moves';
import {
  MOVE_ICON_NAMES,
  MOVE_ICON_REGISTRY,
  getLucideIcon,
  toLucideIconString,
} from '@/lib/move-icons';
import { getKeyBindings } from '@/lib/key-bindings-config';
import { DEFAULT_KEY_BINDINGS, findConflicts, type KeyBindAction } from '@shared/key-bindings';

type StudioTab = 'model' | 'mesh' | 'bones' | 'record' | 'import' | 'anims' | 'moves';

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
  embedded,
  customMoves = [],
  onCustomMovesChange,
}: {
  entity: EditorEntity;
  onChange: (patch: Partial<EditorEntity>) => void;
  onClose: () => void;
  onFocusInMap?: () => void;
  isMobile?: boolean;
  embedded?: boolean;
  /** Map-level custom moves (Moves tab) — lives on MapDocument, not the entity. */
  customMoves?: CustomMoveDef[];
  onCustomMovesChange?: (moves: CustomMoveDef[]) => void;
}) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<StudioPreview | null>(null);
  // Guards the "Reload preview" button below: unlike the model-source effect
  // above (which has a `cancelled` flag), this handler had no way to detect
  // a second click landing before the first async load finished — both
  // would construct their own StudioPreview and append its canvas, and
  // whichever resolved last silently overwrote previewRef.current, leaking
  // the other instance's renderer/canvas and its render-loop RAF forever.
  const reloadTokenRef = useRef(0);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live admin-configured global scheme (Map Editor → Controls), for the
  // Moves tab's key-conflict check — falls back to DEFAULT_KEY_BINDINGS
  // (same set RESERVED_MOVE_KEYS is derived from) until it resolves.
  const [globalBindings, setGlobalBindings] =
    useState<Record<KeyBindAction, string>>(DEFAULT_KEY_BINDINGS);
  useEffect(() => {
    let cancelled = false;
    getKeyBindings()
      .then((b) => {
        if (!cancelled) setGlobalBindings(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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

  // --- Mixamo import (Import tab) ---
  const [mixamoFileName, setMixamoFileName] = useState<string | null>(null);
  const [mixamoClips, setMixamoClips] = useState<THREE.AnimationClip[]>([]);
  const [mixamoClipIdx, setMixamoClipIdx] = useState(0);
  const [mixamoBoneMap, setMixamoBoneMap] = useState<Record<string, string>>({});
  const [mixamoBoneMapHistory, setMixamoBoneMapHistory] = useState<Record<string, string>[]>([]);
  const [mixamoClipName, setMixamoClipName] = useState('');
  const [mixamoLoading, setMixamoLoading] = useState(false);
  const [mixamoError, setMixamoError] = useState<string | null>(null);
  const [mixamoStatus, setMixamoStatus] = useState<string | null>(null);
  const [renamingClip, setRenamingClip] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [scrubTime, setScrubTime] = useState(0);
  const [scrubDuration, setScrubDuration] = useState(0);
  const [scrubPaused, setScrubPaused] = useState(false);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const movePowerSyncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const anim = ensureAnimation(entity);
  const clips = anim.availableClips;
  const bindings = entity.playerAnims ?? {};
  const meshEdits = entity.playerMeshEdits ?? {};
  const extraBones = entity.playerExtraBones ?? [];
  const authoredClips = entity.playerAuthoredClips ?? [];

  /**
   * Every custom move gets its own skill-tree unlock entry automatically —
   * a real PowerDefinition (DB-backed, the same content the Power Editor /
   * in-game skill tree read) so low-level players have something to spend
   * points on. maxLevel 1 / no stat bonus: it's a pure unlock gate, not a
   * scaling buff — server checks `abilityLevels[key] > 0` before letting the
   * move trigger (see server/src/sim/movement.ts). Best-effort: sync
   * failures (e.g. non-admin session) don't block editing the move itself.
   */
  const movePowerKey = (moveId: string) => `custom_move_${moveId}`;

  const upsertMovePower = async (move: CustomMoveDef) => {
    const body = {
      key: movePowerKey(move.id),
      name: move.name || 'Custom Move',
      description: `Skill-tree unlock for the "${move.name}" custom move.`,
      icon: move.icon,
      maxLevel: 1,
      unlockLevel: 1,
      prerequisites: [],
      cost: { type: 'flat', base: 1 },
      effectType: 'stat_bonus',
      effectParams: { bonuses: [] },
      sortOrder: 0,
    };
    try {
      const res = await siteOrEngineFetch('/api/game/power-definitions', '/api/engine/powers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        await siteOrEngineFetch('/api/game/power-definitions', '/api/engine/powers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
    } catch (err) {
      console.warn('[PlayerModelStudio] skill-tree sync failed for move', move.id, err);
    }
  };

  const scheduleMovePowerSync = (move: CustomMoveDef) => {
    const timers = movePowerSyncTimers.current;
    const existing = timers.get(move.id);
    if (existing) clearTimeout(existing);
    timers.set(
      move.id,
      setTimeout(() => {
        timers.delete(move.id);
        void upsertMovePower(move);
      }, 600)
    );
  };

  const deleteMovePower = async (moveId: string) => {
    try {
      await siteOrEngineFetch(
        `/api/game/power-definitions?key=${encodeURIComponent(movePowerKey(moveId))}`,
        `/api/engine/powers?key=${encodeURIComponent(movePowerKey(moveId))}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      console.warn('[PlayerModelStudio] skill-tree delete failed for move', moveId, err);
    }
  };

  const refreshLists = () => {
    const bones = previewRef.current?.getBoneNames() ?? [];
    const meshes = previewRef.current?.getMeshNames() ?? [];
    setBoneNames(bones);
    setMeshNames(meshes);
  };

  // One-time: strip legacy mannequin / uploads → pack Blue 001
  useEffect(() => {
    const patch = migratePlayerEntityToPackBlue(entity);
    if (patch) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

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
    if (!previewSlot) return;
    const id = window.setInterval(() => {
      const info = previewRef.current?.getCurrentClipInfo();
      if (!info) return;
      setScrubDuration(info.duration);
      if (!info.paused) setScrubTime(info.time);
      setScrubPaused(info.paused);
    }, 80);
    return () => window.clearInterval(id);
  }, [previewSlot]);

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

  /** Rename an authored clip, keeping availableClips and slot bindings in sync. */
  const renameAuthoredClip = (oldName: string, rawNewName: string) => {
    const newName = rawNewName.trim();
    if (!newName || newName === oldName) return;
    if (authoredClips.some((c) => c.name === newName)) {
      setMixamoError(`A clip named "${newName}" already exists.`);
      return;
    }
    const nextAuthored = authoredClips.map((c) =>
      c.name === oldName ? { ...c, name: newName } : c
    );
    const nextAvailable = clips.map((n) => (n === oldName ? newName : n));
    const nextBindings = { ...bindings };
    for (const slot of Object.keys(nextBindings) as PlayerAnimSlot[]) {
      if (nextBindings[slot] === oldName) nextBindings[slot] = newName;
    }
    onChange({
      playerAuthoredClips: nextAuthored,
      animation: { ...anim, availableClips: nextAvailable },
      playerAnims: nextBindings,
    });
  };

  const playSlot = (slot: PlayerAnimSlot) => {
    const clip = bindings[slot] || bindings.idle;
    if (!clip) return;
    setPreviewSlot(slot);
    const loop = slot !== 'die' && slot !== 'land' && slot !== 'jump';
    previewRef.current?.playClip(clip, loop);
  };

  /** Quick sanity check: play attack then reload back-to-back so combat feel can be eyeballed. */
  const testCombatCombo = () => {
    playSlot('attack');
    window.setTimeout(() => playSlot('reload'), 500);
    window.setTimeout(() => playSlot('idle'), 1600);
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

  const targetBoneNames = () => {
    const live = previewRef.current?.getBoneNames();
    return live && live.length ? live : boneNames;
  };

  const initMixamoBoneMap = (clip: THREE.AnimationClip) => {
    const usage = listClipBones(clip, targetBoneNames());
    const map: Record<string, string> = {};
    for (const { sourceBone, guess } of usage) {
      if (guess) map[sourceBone] = guess;
    }
    setMixamoBoneMap(map);
    setMixamoBoneMapHistory([]);
    setMixamoClipName(clip.name || 'mixamo_clip');
  };

  const handleMixamoFile = async (file: File) => {
    setMixamoLoading(true);
    setMixamoError(null);
    setMixamoStatus(null);
    setMixamoFileName(file.name);
    const url = URL.createObjectURL(file);
    // Blob URLs (blob:https://…/uuid) have no file extension for the loader
    // to sniff, so an FBX upload silently fell through to the glTF loader
    // and failed — pass the real filename's extension through explicitly.
    const forceFbx = /\.fbx$/i.test(file.name);
    try {
      const loaded = await loadAnimatedPrefab(url, forceFbx);
      if (!loaded.clips.length) {
        setMixamoError('No animation clips found in that file.');
        setMixamoClips([]);
        return;
      }
      setMixamoClips(loaded.clips);
      setMixamoClipIdx(0);
      initMixamoBoneMap(loaded.clips[0]);
    } catch (err) {
      console.warn('[PlayerModelStudio] mixamo import failed', err);
      setMixamoError('Could not read that file — expected an FBX or GLB with baked animation.');
      setMixamoClips([]);
    } finally {
      URL.revokeObjectURL(url);
      setMixamoLoading(false);
    }
  };

  const buildMixamoAuthored = () => {
    const clip = mixamoClips[mixamoClipIdx];
    if (!clip) return null;
    return retargetClip(clip, mixamoBoneMap, mixamoClipName);
  };

  const previewMixamoClip = () => {
    const built = buildMixamoAuthored();
    if (!built) return;
    const threeClips = authoredClipsToThree([built.authored]);
    previewRef.current?.registerClips(threeClips);
    previewRef.current?.playClip(built.authored.name, true);
    setPreviewSlot('clip');
    setMixamoStatus(
      `Previewing “${built.authored.name}” — ${built.usedTracks} bone track(s) mapped, ${built.droppedTracks} skipped.`
    );
  };

  const saveMixamoClip = () => {
    const built = buildMixamoAuthored();
    if (!built) return;
    const nextAuthored = [
      ...authoredClips.filter((c) => c.name !== built.authored.name),
      built.authored,
    ];
    const threeClips = authoredClipsToThree([built.authored]);
    previewRef.current?.registerClips(threeClips);
    const allNames = Array.from(
      new Set([...(entity.animation?.availableClips ?? clips), built.authored.name])
    );
    onChange({
      playerAuthoredClips: nextAuthored,
      animation: {
        ...(entity.animation ?? ensureAnimation(entity)),
        availableClips: allNames,
      },
    });
    setClipCount(allNames.length);
    setMixamoStatus(`Saved “${built.authored.name}” — pick it in the Anims tab to bind it to a slot.`);
  };

  /**
   * Import every clip in the uploaded FBX/GLB in one pass, reusing the
   * current bone map (same source rig for every clip in the file, so the
   * mapping the user reviewed for clip 0 applies to all of them).
   */
  const saveAllMixamoClips = () => {
    if (!mixamoClips.length) return;
    const built = mixamoClips.map((clip, i) =>
      retargetClip(clip, mixamoBoneMap, clip.name || `${mixamoFileName ?? 'mixamo'}_${i}`)
    );
    const existingByName = new Map(authoredClips.map((c) => [c.name, c]));
    for (const b of built) existingByName.set(b.authored.name, b.authored);
    const nextAuthored = Array.from(existingByName.values());
    const threeClips = authoredClipsToThree(built.map((b) => b.authored));
    previewRef.current?.registerClips(threeClips);
    const allNames = Array.from(
      new Set([...(entity.animation?.availableClips ?? clips), ...built.map((b) => b.authored.name)])
    );
    onChange({
      playerAuthoredClips: nextAuthored,
      animation: {
        ...(entity.animation ?? ensureAnimation(entity)),
        availableClips: allNames,
      },
    });
    setClipCount(allNames.length);
    setMixamoStatus(`Imported ${built.length} clip(s) — pick them in the Anims tab to bind slots.`);
  };

  const tabs: { id: StudioTab; label: string }[] = [
    { id: 'model', label: 'Model' },
    { id: 'mesh', label: 'Mesh' },
    { id: 'bones', label: 'Bones' },
    { id: 'record', label: 'Record' },
    { id: 'import', label: 'Import' },
    { id: 'anims', label: 'Anims' },
    { id: 'moves', label: 'Moves' },
  ];

  return (
    <aside
      className={`flex flex-col bg-[#0e1520] border-white/10 text-white shadow-2xl z-[90] ${
        embedded
          ? 'h-full min-h-0 w-full border-0 shadow-none'
          : isMobile
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
        {previewSlot && scrubDuration > 0 && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/55 px-2 py-1">
            <button
              type="button"
              className="text-[10px] text-cyan-200 w-6 shrink-0"
              onClick={() => {
                const next = !scrubPaused;
                previewRef.current?.setPaused(next);
                setScrubPaused(next);
              }}
            >
              {scrubPaused ? '▶' : '⏸'}
            </button>
            <input
              type="range"
              min={0}
              max={scrubDuration}
              step={scrubDuration / 200}
              value={scrubTime}
              onChange={(e) => {
                const t = Number(e.target.value);
                setScrubTime(t);
                previewRef.current?.scrubTo(t);
                setScrubPaused(true);
              }}
              className="flex-1 h-1"
            />
            <span className="text-[9px] text-white/50 w-14 text-right tabular-nums shrink-0">
              {scrubTime.toFixed(2)}s / {scrubDuration.toFixed(2)}s
            </span>
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
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Player body</p>
              <div className="rounded-lg border border-sky-500/30 bg-sky-950/30 px-3 py-2 space-y-1">
                <p className="text-sm font-semibold text-sky-200">Blue 001 (Characters pack)</p>
                <p className="text-[10px] text-white/50 leading-snug">
                  Only pack player mesh. Animations from Basic_Character. Solo = Blue tint;
                  other players get unique colors automatically.
                </p>
                <Button
                  size="sm"
                  className="w-full mt-1"
                  variant={
                    entity.customModelUrl === DEFAULT_PACK_PLAYER_URL || !entity.customModelUrl
                      ? 'default'
                      : 'secondary'
                  }
                  onClick={() =>
                    onChange({
                      model: undefined,
                      customModelUrl: DEFAULT_PACK_PLAYER_URL,
                      playerAnims: {},
                    })
                  }
                >
                  Use Blue 001 + full anims
                </Button>
              </div>

              <CharacterAssetPicker
                categories={['body']}
                valueUrl={
                  entity.customModelUrl?.startsWith('/game/skins/bodies/')
                    ? entity.customModelUrl
                    : DEFAULT_PACK_PLAYER_URL
                }
                onPick={(_entry, modelUrl) => {
                  onChange({
                    model: undefined,
                    customModelUrl: modelUrl,
                    playerAnims: {},
                  });
                }}
                label="Pack bodies only"
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 min-h-10"
                  title="Reload preview"
                  onClick={() => {
                    previewRef.current?.dispose();
                    previewRef.current = null;
                    const host = canvasHostRef.current;
                    if (host) {
                      const token = ++reloadTokenRef.current;
                      void loadPlayerAvatar({
                        ...entity,
                        customModelUrl: entity.customModelUrl || DEFAULT_PACK_PLAYER_URL,
                        model: undefined,
                      }).then((loaded) => {
                        // A second click landed before this load resolved —
                        // that click already disposed/rebuilt its own
                        // preview, so let this stale one drop instead of
                        // overwriting it with a since-superseded instance.
                        if (token !== reloadTokenRef.current) return;
                        previewRef.current = new StudioPreview(host);
                        previewRef.current.setAvatar(loaded.scene, loaded.animations);
                        setClipCount(loaded.clipNames.length);
                        const patch = applyClipsToPlayerEntity(entity, loaded.clipNames, true);
                        onChange(patch);
                        refreshLists();
                        const idle =
                          (patch.playerAnims ?? bindings).idle ?? loaded.clipNames[0];
                        if (idle) previewRef.current.playClip(idle, true);
                      });
                    }
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Reload anims
                </Button>
              </div>
            </div>

            {/* Player base = pack Blue 001 only (no GLB upload / prototype props) */}

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

        {tab === 'import' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-white/45">
                Upload Mixamo clip
              </p>
              <label className="flex items-center justify-center gap-2 min-h-10 rounded border border-dashed border-white/20 bg-black/30 text-xs text-white/60 cursor-pointer hover:border-sky-400/50 hover:text-sky-200">
                <Upload className="w-3.5 h-3.5" />
                <span className="truncate">{mixamoFileName ?? 'Choose FBX or GLB…'}</span>
                <input
                  type="file"
                  accept=".fbx,.glb,.gltf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleMixamoFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-[10px] text-white/40 leading-snug">
                Export from Mixamo as FBX (baked animation, Y-up) or a GLB with animation. Bone
                names get matched to this avatar&apos;s rig automatically — review the mapping
                below before saving.
              </p>
              {mixamoLoading && <p className="text-[10px] text-sky-300">Reading file…</p>}
              {mixamoError && <p className="text-[10px] text-rose-300">{mixamoError}</p>}
            </div>

            {mixamoClips.length > 0 && (
              <>
                {mixamoClips.length > 1 && (
                  <label className="block text-xs text-white/60">
                    Clip in file
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                      value={mixamoClipIdx}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setMixamoClipIdx(idx);
                        initMixamoBoneMap(mixamoClips[idx]);
                        setMixamoStatus(null);
                      }}
                    >
                      {mixamoClips.map((c, i) => (
                        <option key={`${c.name}-${i}`} value={i}>
                          {c.name || `Clip ${i + 1}`} ({c.duration.toFixed(2)}s)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block text-xs text-white/60">
                  Save as clip name
                  <input
                    className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
                    value={mixamoClipName}
                    onChange={(e) => setMixamoClipName(e.target.value)}
                  />
                </label>

                <div className="rounded-lg border border-white/10 bg-black/25 p-2 space-y-1.5 max-h-56 overflow-y-auto">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/45">
                      Bone mapping ({Object.keys(mixamoBoneMap).length} mapped)
                    </p>
                    <button
                      type="button"
                      disabled={!mixamoBoneMapHistory.length}
                      className="text-[10px] text-cyan-300 hover:text-cyan-200 disabled:opacity-30 disabled:hover:text-cyan-300"
                      onClick={() => {
                        setMixamoBoneMapHistory((h) => {
                          if (!h.length) return h;
                          const prev = h[h.length - 1];
                          setMixamoBoneMap(prev);
                          return h.slice(0, -1);
                        });
                      }}
                    >
                      Undo
                    </button>
                  </div>
                  {listClipBones(mixamoClips[mixamoClipIdx], targetBoneNames()).map(
                    ({ sourceBone }) => (
                      <div key={sourceBone} className="flex items-center gap-2 text-[11px]">
                        <span className="truncate text-white/55 flex-1" title={sourceBone}>
                          {sourceBone}
                        </span>
                        <select
                          className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] w-40 shrink-0"
                          value={mixamoBoneMap[sourceBone] ?? ''}
                          onChange={(e) => {
                            setMixamoBoneMapHistory((h) => [...h, mixamoBoneMap]);
                            setMixamoBoneMap((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[sourceBone] = e.target.value;
                              else delete next[sourceBone];
                              return next;
                            });
                          }}
                        >
                          <option value="">— skip —</option>
                          {targetBoneNames().map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 min-h-10"
                    onClick={previewMixamoClip}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 min-h-10 bg-emerald-600 hover:bg-emerald-500"
                    disabled={!mixamoClipName.trim()}
                    onClick={saveMixamoClip}
                  >
                    Save clip to avatar
                  </Button>
                </div>
                {mixamoClips.length > 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full min-h-9"
                    onClick={saveAllMixamoClips}
                  >
                    Import all {mixamoClips.length} clips (same bone map)
                  </Button>
                )}
                {mixamoStatus && (
                  <p className="text-[10px] text-emerald-300 leading-snug">{mixamoStatus}</p>
                )}
                <p className="text-[10px] text-white/40 leading-snug">
                  This renames bone tracks to match — it does not correct bind-pose / bone-roll
                  differences. Simple locomotion clips usually preview fine; anything that looks
                  twisted still benefits from a proper Blender/Cascadeur retarget (see
                  docs/ANIMATIONS_MIXAMO_AND_COMBAT.md).
                </p>
              </>
            )}
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
              {(bindings.attack || bindings.punch) && bindings.reload && (
                <button
                  type="button"
                  className="w-full text-[10px] py-1.5 rounded-md bg-amber-600/25 hover:bg-amber-500/35 border border-amber-400/30 text-amber-100"
                  onClick={testCombatCombo}
                >
                  Test combo (attack → reload)
                </button>
              )}

              <label className="flex items-center gap-2 text-[10px] text-white/50">
                <span className="shrink-0">
                  Blend time: {anim.blendMs ?? 120}ms
                </span>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={10}
                  value={anim.blendMs ?? 120}
                  onChange={(e) =>
                    onChange({ animation: { ...anim, blendMs: Number(e.target.value) } })
                  }
                  className="flex-1"
                />
              </label>

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
                {authoredClips.map((c) =>
                  renamingClip === c.name ? (
                    <div key={c.name} className="flex items-center gap-1.5 text-[11px]">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            renameAuthoredClip(c.name, renameValue);
                            setRenamingClip(null);
                          } else if (e.key === 'Escape') {
                            setRenamingClip(null);
                          }
                        }}
                        className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white"
                      />
                      <button
                        type="button"
                        className="text-emerald-300"
                        onClick={() => {
                          renameAuthoredClip(c.name, renameValue);
                          setRenamingClip(null);
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="text-white/50"
                        onClick={() => setRenamingClip(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div key={c.name} className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        className="text-cyan-200 underline truncate"
                        onClick={() => playRawClip(c.name)}
                      >
                        {c.name}
                      </button>
                      <span className="text-white/35">{c.duration.toFixed(2)}s</span>
                      <button
                        type="button"
                        className="ml-auto text-white/50 hover:text-white/80"
                        onClick={() => {
                          setRenamingClip(c.name);
                          setRenameValue(c.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="text-rose-300"
                        onClick={() => {
                          onChange({
                            playerAuthoredClips: authoredClips.filter((x) => x.name !== c.name),
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}

        {tab === 'moves' && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/40 leading-snug">
              Custom movement abilities — bind a key, an animation clip, an energy cost and
              cooldown. Live in matches and Play Test immediately, no code changes needed.
            </p>
            <Button
              size="sm"
              className="w-full min-h-9 bg-sky-600 hover:bg-sky-500"
              onClick={() => {
                const move = defaultCustomMove();
                onCustomMovesChange?.([...customMoves, move]);
                void upsertMovePower(move);
              }}
            >
              + Add Move
            </Button>
            {customMoves.length === 0 && (
              <p className="text-[11px] text-white/40">No custom moves yet.</p>
            )}
            {customMoves.map((move) => {
              const globalConflicts = findConflicts(globalBindings, move.key);
              const otherMoveConflict = customMoves.some(
                (m) => m.id !== move.id && m.key.toLowerCase() === move.key.toLowerCase()
              );
              const keyConflict = globalConflicts.length > 0 || otherMoveConflict;
              const update = (patch: Partial<CustomMoveDef>) => {
                const nextMove = { ...move, ...patch };
                onCustomMovesChange?.(customMoves.map((m) => (m.id === move.id ? nextMove : m)));
                if (patch.name !== undefined || patch.icon !== undefined) {
                  scheduleMovePowerSync(nextMove);
                }
              };
              return (
                <div
                  key={move.id}
                  className="rounded-lg border border-white/10 bg-black/25 p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-1.5 relative">
                    <button
                      type="button"
                      title="Choose icon"
                      onClick={() => setIconPickerFor(iconPickerFor === move.id ? null : move.id)}
                      className="w-9 h-9 shrink-0 flex items-center justify-center bg-black/40 border border-white/10 rounded hover:border-sky-400/50"
                    >
                      {(() => {
                        const Icon = getLucideIcon(move.icon) ?? MOVE_ICON_REGISTRY.Sparkles;
                        return <Icon className="w-4 h-4" />;
                      })()}
                    </button>
                    {iconPickerFor === move.id && (
                      <div className="absolute top-10 left-0 z-10 grid grid-cols-6 gap-1 p-2 rounded-lg border border-white/15 bg-[#121a24] shadow-xl">
                        {MOVE_ICON_NAMES.map((name) => {
                          const Icon = MOVE_ICON_REGISTRY[name];
                          return (
                            <button
                              key={name}
                              type="button"
                              title={name}
                              onClick={() => {
                                update({ icon: toLucideIconString(name) });
                                setIconPickerFor(null);
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/15"
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <input
                      value={move.name}
                      onChange={(e) => update({ name: e.target.value })}
                      className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      className="text-rose-300 text-[11px] px-1.5"
                      onClick={() => {
                        onCustomMovesChange?.(customMoves.filter((m) => m.id !== move.id));
                        void deleteMovePower(move.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] text-white/50">
                      Key
                      <input
                        value={move.key}
                        onChange={(e) => {
                          const nextKey = e.target.value.slice(-1).toLowerCase();
                          update({ key: nextKey });
                          const conflicts = findConflicts(globalBindings, nextKey);
                          const otherMove = customMoves.find(
                            (m) => m.id !== move.id && m.key.toLowerCase() === nextKey
                          );
                          if (conflicts.length > 0) {
                            toast({
                              title: 'Key already in use',
                              description: `"${nextKey.toUpperCase()}" is bound to ${conflicts
                                .map((c) => c.label)
                                .join(', ')}. Free it up in Map Editor → Controls, or pick another key.`,
                              variant: 'destructive',
                            });
                          } else if (otherMove) {
                            toast({
                              title: 'Key already in use',
                              description: `"${nextKey.toUpperCase()}" is already used by "${otherMove.name}".`,
                              variant: 'destructive',
                            });
                          }
                        }}
                        maxLength={1}
                        className={`mt-0.5 w-full bg-black/40 border rounded px-2 py-1 text-sm uppercase text-center ${
                          keyConflict ? 'border-rose-400/60 text-rose-200' : 'border-white/10'
                        }`}
                      />
                    </label>
                    <label className="block text-[10px] text-white/50">
                      Animation clip
                      <select
                        value={move.clipName ?? ''}
                        onChange={(e) => update({ clipName: e.target.value || undefined })}
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px]"
                      >
                        <option value="">— none —</option>
                        {clips.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[10px] text-white/50">
                      Energy cost
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={move.energyCost}
                        onChange={(e) => update({ energyCost: Math.max(0, Number(e.target.value) || 0) })}
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] text-white/50">
                      Duration (ms)
                      <input
                        type="number"
                        min={50}
                        max={5000}
                        step={50}
                        value={move.durationMs}
                        onChange={(e) => update({ durationMs: Math.max(50, Number(e.target.value) || 50) })}
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] text-white/50">
                      Cooldown (ms)
                      <input
                        type="number"
                        min={0}
                        max={30000}
                        step={100}
                        value={move.cooldownMs}
                        onChange={(e) => update({ cooldownMs: Math.max(0, Number(e.target.value) || 0) })}
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] text-white/50">
                      Vertical hop (0 = none)
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={move.vzBoost}
                        onChange={(e) => update({ vzBoost: Math.max(0, Number(e.target.value) || 0) })}
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-[10px] text-white/50">
                    <input
                      type="checkbox"
                      checked={move.groundedOnly}
                      onChange={(e) => update({ groundedOnly: e.target.checked })}
                    />
                    Grounded only
                  </label>

                  <p className="text-[10px] text-white/40">
                    🔊 Sound auto-registered as &quot;{move.name}&quot; in Map Editor → Sound
                    Board → Custom Moves — upload a clip there, no key to type.
                  </p>

                  {keyConflict && (
                    <p className="text-[10px] text-rose-300">
                      Key &quot;{move.key.toUpperCase()}&quot; is already used by{' '}
                      {globalConflicts.length > 0
                        ? globalConflicts.map((c) => c.label).join(', ')
                        : 'another custom move'}
                      {' '}— pick a different one, or free it up in Map Editor →
                      Controls.
                    </p>
                  )}

                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full min-h-8"
                    disabled={!move.clipName}
                    onClick={() => {
                      if (move.clipName) previewRef.current?.playClip(move.clipName, false);
                      setPreviewSlot('clip');
                    }}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Preview clip
                  </Button>
                </div>
              );
            })}
          </div>
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
      disposeClonedMaterials(this.avatarRoot);
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
    next.paused = false;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(0.12).play();
    this.current = name;
  }

  /** Current clip's playhead / length, for the scrub bar. Null when nothing is playing. */
  getCurrentClipInfo(): { time: number; duration: number; paused: boolean } | null {
    const action = this.current ? this.actions.get(this.current) : undefined;
    if (!action) return null;
    return { time: action.time, duration: action.getClip().duration, paused: action.paused };
  }

  setPaused(paused: boolean) {
    const action = this.current ? this.actions.get(this.current) : undefined;
    if (action) action.paused = paused;
  }

  /** Jump the current clip's playhead to `t` seconds (pauses playback). */
  scrubTo(t: number) {
    const action = this.current ? this.actions.get(this.current) : undefined;
    if (!action) return;
    action.paused = true;
    action.time = Math.max(0, Math.min(t, action.getClip().duration || 0));
    this.mixer?.update(0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mixer?.stopAllAction();
    this.transform?.dispose();
    if (this.avatarRoot) disposeClonedMaterials(this.avatarRoot);
    const ro = (this as unknown as { _ro?: ResizeObserver })._ro;
    ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
