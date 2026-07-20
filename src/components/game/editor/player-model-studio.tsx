'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  PersonStanding,
  Upload,
  X,
  Play,
  Wand2,
  RefreshCw,
  Crosshair,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorEntity, PlayerAnimSlot } from './map-document';
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

/**
 * Side panel beside the map: inspect player model, bind walk/jump/die clips,
 * preview animations on a live avatar.
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

  const anim = ensureAnimation(entity);
  const clips = anim.availableClips;
  const bindings = entity.playerAnims ?? {};

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
        // Only write clips if they changed (avoid render loop)
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
    // Re-load when model identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.model, entity.customModelUrl, entity.id]);

  useEffect(() => {
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

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

  return (
    <aside
      className={`flex flex-col bg-[#0e1520] border-white/10 text-white shadow-2xl z-[90] ${
        isMobile
          ? 'absolute inset-0 border-0'
          : 'relative w-[min(100%,400px)] shrink-0 border-l'
      }`}
      aria-label="Player Model studio"
    >
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-white/10 bg-[#121a24]">
        <PersonStanding className="w-4 h-4 text-sky-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide uppercase text-sky-200 truncate">
            Player Model
          </p>
          <p className="text-[10px] text-white/45 truncate">Inspect · bind · preview</p>
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

      {/* Live preview */}
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
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
                (m) => m.includes('figurine') || m.includes('character') || m.includes('person')
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
                // Force remount of preview by touching name
                onChange({ name: entity.name });
                previewRef.current?.dispose();
                previewRef.current = null;
                const host = canvasHostRef.current;
                if (host) {
                  void loadPlayerAvatar(entity).then((loaded) => {
                    previewRef.current = new StudioPreview(host);
                    previewRef.current.setAvatar(loaded.scene, loaded.animations);
                    setClipCount(loaded.clipNames.length);
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
          <p className="text-[10px] text-white/40 leading-snug">
            Empty = built-in Deathrun mannequin with walk/run/jump packs. Upload an animated GLB to
            use a custom avatar in Play Test and matches (same browser MAIN map).
          </p>
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

        <div className="space-y-1.5 border-t border-white/10 pt-2">
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
              No clips yet — pick the mannequin or upload an animated GLB.
            </p>
          ) : (
            PLAYER_ANIM_SLOTS.map(({ id, label, hint }) => (
              <div key={id} className="flex items-end gap-1.5">
                <label className="flex-1 block text-xs text-white/60 min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    <span>{label}</span>
                    {hint && <span className="text-[9px] text-white/35 truncate">{hint}</span>}
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

        <p className="text-[10px] text-white/35 leading-snug">
          Bindings drive Play Test and Deathrun when this map is MAIN. Die plays once on
          elimination; walk / run / jump / crouch switch from movement state.
        </p>
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
      this.pivot.rotation.y += dt * 0.35;
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
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    this.current = '';

    normalizeCharacter(scene, 1.75);
    this.baseScale = scene.scale.x || 1;
    scene.scale.setScalar(this.baseScale * this.userScale);
    this.avatarRoot = scene;
    this.pivot.add(scene);

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of animations) {
      const name = clip.name || '(unnamed)';
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(name, action);
    }
  }

  setUniformScale(s: number) {
    this.userScale = s;
    if (this.avatarRoot) {
      this.avatarRoot.scale.setScalar(this.baseScale * s);
    }
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
    const ro = (this as unknown as { _ro?: ResizeObserver })._ro;
    ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
