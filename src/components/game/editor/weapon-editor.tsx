'use client';

/**
 * Weapon Editor — standalone fullscreen panel for authoring weapon definitions.
 *
 * Sections:
 *   model   — 3D preview with player model, pick catalog model or upload GLB
 *   hold    — active hand position / rotation / scale (right hand)
 *   back    — holster / back-carry position when not in use
 *   combat  — damage, range, cooldown, cone, attack type, bullets per shot
 *   recoil  — camera kick, gun kick-back, recovery speed
 *   sway    — idle & movement weapon sway
 *   anims   — idle / fire / reload clip assignments on the weapon mesh
 *   shop    — in-game price, name, description
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  X,
  Save,
  RotateCcw,
  Upload,
  Sword,
  Eye,
  Move3d,
  Settings2,
  Zap,
  ShoppingCart,
  Film,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_WEAPON_DEF,
  type MapWeaponDef,
  type MapDocument,
  ensureCombatSettings,
} from './map-document';
import { loadPlayerAvatar } from './player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import { PROTOTYPE_MODELS, modelUrl } from './prototype-catalog';
import { CATALOG_WEAPONS } from '@/lib/weapon-catalog';

type Tab = 'model' | 'hold' | 'back' | 'combat' | 'recoil' | 'sway' | 'anims' | 'shop';

const WEAPON_MODELS = [
  ...PROTOTYPE_MODELS.filter(
    (m) => m.startsWith('weapon-') || m.includes('sword') || m.includes('shield')
  ),
  ...CATALOG_WEAPONS.map((w) => w.id),
];

function weaponModelSrc(id: string): string {
  const cat = CATALOG_WEAPONS.find((w) => w.id === id);
  if (cat) return cat.modelUrl;
  return modelUrl(id);
}

// ── Shared field components ─────────────────────────────────────────────────

function Section({
  title,
  accent = 'sky',
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-${accent}-300/80 hover:bg-white/5`}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const display = Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2);
  return (
    <label className="flex items-center gap-2 text-[10px] text-white/50">
      <span className="w-28 shrink-0 leading-tight">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-amber-400"
      />
      <span className="w-14 text-right tabular-nums text-white/70">
        {display}
        {unit ? ` ${unit}` : ''}
      </span>
    </label>
  );
}

function Vec3Row({
  label,
  value,
  step = 0.05,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  step?: number;
  onChange: (v: [number, number, number]) => void;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-white/40">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <label key={axis} className="text-[9px] text-white/35">
            {axis}
            <input
              type="number"
              step={step}
              value={value[i].toFixed(3)}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = Number(e.target.value) || 0;
                onChange(next);
              }}
              className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[10px] text-white/80"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function WeaponEditor({
  mapDoc,
  onClose,
  onSaveToMap,
  embedded,
  isMobile,
}: {
  isMobile?: boolean;
  mapDoc: MapDocument;
  onClose: () => void;
  onSaveToMap: (def: Partial<MapWeaponDef>) => void;
  /** Render inside map-editor left nav instead of fullscreen overlay. */
  embedded?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('model');
  const [dirty, setDirty] = useState(false);

  // Merge stored def with defaults
  const [def, setDefRaw] = useState<MapWeaponDef>(() => ({
    ...DEFAULT_WEAPON_DEF,
    ...mapDoc.weaponDef,
  }));

  const defRef = useRef(def);
  defRef.current = def;

  const patch = useCallback((partial: Partial<MapWeaponDef>) => {
    setDefRaw((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Three.js preview ────────────────────────────────────────────────────────
  const sceneRef = useRef<THREE.Scene | null>(null);
  const weaponGroupRef = useRef<THREE.Group | null>(null);
  const weaponMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const weaponActionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef(0);
  const clockRef = useRef(new THREE.Clock());
  const yawRef = useRef(0.4);
  const pitchRef = useRef(0.15);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1421);
    scene.fog = new THREE.FogExp2(0x0c1830, 0.018);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);
    camera.position.set(0, 1.2, 3.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.HemisphereLight(0xa0c0e8, 0x1a2440, 0.65));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.0);
    sun.position.set(3, 8, 4);
    sun.castShadow = true;
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid overlay
    const grid = new THREE.GridHelper(20, 20, 0x223344, 0x1a2a3a);
    scene.add(grid);

    // Placeholder player body (capsule mannequin)
    const playerGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a8fbf, roughness: 0.4 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.65, 4, 10), bodyMat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), bodyMat);
    head.position.y = 1.72;
    // Right hand position marker
    const handMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24 });
    const handSphere = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), handMat);
    handSphere.position.set(0.42, 0.92, 0.18);
    // Back position marker
    const backMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa });
    const backSphere = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), backMat);
    backSphere.position.set(0, 1.0, -0.18);
    playerGroup.add(torso, head, handSphere, backSphere);
    scene.add(playerGroup);

    // Load real avatar if available
    void (async () => {
      const playerEnt = mapDoc.entities.find((e) => e.kind === 'player');
      if (playerEnt) {
        try {
          const avatar = await loadPlayerAvatar(playerEnt);
          if (avatar?.scene && sceneRef.current) {
            normalizeCharacter(avatar.scene, 1);
            playerGroup.remove(...playerGroup.children);
            playerGroup.add(avatar.scene);
          }
        } catch {
          // keep placeholder
        }
      }
    })();

    // Weapon mesh group
    const weaponGroup = new THREE.Group();
    scene.add(weaponGroup);
    weaponGroupRef.current = weaponGroup;

    // Load initial weapon model
    void loadWeaponModel(defRef.current, weaponGroup).then((clips) => {
      if (!clips.length || !weaponGroup.children[0]) return;
      const mixer = new THREE.AnimationMixer(weaponGroup.children[0]);
      weaponMixerRef.current = mixer;
      weaponActionsRef.current.clear();
      for (const clip of clips) {
        const action = mixer.clipAction(clip);
        weaponActionsRef.current.set((clip.name || '').toLowerCase(), action);
        if (clip.name) weaponActionsRef.current.set(clip.name, action);
      }
    });

    // Orbit drag
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      yawRef.current -= (e.clientX - dragRef.current.x) * 0.008;
      pitchRef.current -= (e.clientY - dragRef.current.y) * 0.006;
      pitchRef.current = Math.max(-0.4, Math.min(0.9, pitchRef.current));
      dragRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = () => { dragRef.current = null; };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!rendererRef.current) return;
      const dt = clockRef.current.getDelta();
      weaponMixerRef.current?.update(dt);
      const r = 3.2;
      const cy = pitchRef.current;
      camera.position.set(
        Math.sin(yawRef.current) * r * Math.cos(cy),
        1.0 + r * Math.sin(cy),
        Math.cos(yawRef.current) * r * Math.cos(cy)
      );
      camera.lookAt(0, 1.0, 0);
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      renderer.render(scene, camera);
    };
    tick();
    rafRef.current = raf;

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
      weaponGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-position weapon mesh when hold position/rotation/scale changes
  useEffect(() => {
    const wg = weaponGroupRef.current;
    if (!wg) return;
    const [px, py, pz] = def.holdPosition;
    const [rx, ry, rz] = def.holdRotation;
    const [sx, sy, sz] = def.holdScale;
    wg.position.set(px, py, pz);
    wg.rotation.set(
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz)
    );
    wg.scale.set(sx, sy, sz);
  }, [def.holdPosition, def.holdRotation, def.holdScale]);

  // Reload weapon mesh when model changes
  useEffect(() => {
    const wg = weaponGroupRef.current;
    if (!wg) return;
    void loadWeaponModel(def, wg).then((clips) => {
      weaponMixerRef.current?.stopAllAction();
      weaponMixerRef.current = null;
      weaponActionsRef.current.clear();
      if (!clips.length || !wg.children[0]) return;
      const mixer = new THREE.AnimationMixer(wg.children[0]);
      weaponMixerRef.current = mixer;
      for (const clip of clips) {
        const action = mixer.clipAction(clip);
        weaponActionsRef.current.set((clip.name || '').toLowerCase(), action);
        if (clip.name) weaponActionsRef.current.set(clip.name, action);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.model, def.customModelUrl, def.textureUrl]);

  const previewWeaponClip = useCallback((name?: string) => {
    if (!name || !weaponMixerRef.current) return;
    let action =
      weaponActionsRef.current.get(name) ||
      weaponActionsRef.current.get(name.toLowerCase());
    if (!action) {
      const want = name.toLowerCase();
      for (const [n, a] of weaponActionsRef.current) {
        if (n.toLowerCase().includes(want)) {
          action = a;
          break;
        }
      }
    }
    if (!action) return;
    weaponMixerRef.current.stopAllAction();
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
  }, []);

  const save = () => {
    onSaveToMap(def);
    setDirty(false);
  };

  const reset = () => {
    setDefRaw({ ...DEFAULT_WEAPON_DEF });
    setDirty(true);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'model', label: 'Model', icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'hold', label: 'Hold', icon: <Move3d className="w-3.5 h-3.5" /> },
    { id: 'back', label: 'Back', icon: <Move3d className="w-3.5 h-3.5 text-sky-300" /> },
    { id: 'combat', label: 'Combat', icon: <Sword className="w-3.5 h-3.5" /> },
    { id: 'recoil', label: 'Recoil', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'sway', label: 'Sway', icon: <Settings2 className="w-3.5 h-3.5" /> },
    { id: 'anims', label: 'Anims', icon: <Film className="w-3.5 h-3.5" /> },
    { id: 'shop', label: 'Shop', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      className={
        embedded
          ? 'flex flex-col h-full min-h-0 w-full bg-[#0e1520]'
          : `fixed inset-0 z-[3000] ${isMobile ? 'flex flex-col' : 'flex'} bg-[#0e1520] backdrop-blur-md`
      }
    >
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div
        className={
          embedded
            ? 'flex flex-col flex-1 min-h-0 overflow-hidden'
            : isMobile
              ? 'w-full flex-1 min-h-0 flex flex-col bg-[#0e1520] border-b border-white/10 overflow-hidden'
              : 'w-72 shrink-0 flex flex-col bg-[#0e1520] border-r border-white/10 overflow-hidden'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#121a24]">
          <div className="flex items-center gap-2">
            <Sword className="w-4 h-4 text-amber-300" />
            <span className="text-sm font-black text-white tracking-tight">Weapon Editor</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-white/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                tab === t.id
                  ? 'bg-amber-500/30 border border-amber-400/50 text-amber-100'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
          {tab === 'model' && <ModelTab def={def} patch={patch} fileRef={fileRef} />}
          {tab === 'hold' && <HoldTab def={def} patch={patch} />}
          {tab === 'back' && <BackTab def={def} patch={patch} />}
          {tab === 'combat' && <CombatTab def={def} patch={patch} />}
          {tab === 'recoil' && <RecoilTab def={def} patch={patch} />}
          {tab === 'sway' && <SwayTab def={def} patch={patch} mapDoc={mapDoc} />}
          {tab === 'anims' && (
            <AnimsTab def={def} patch={patch} onPreviewClip={previewWeaponClip} />
          )}
          {tab === 'shop' && <ShopTab def={def} patch={patch} />}
        </div>

        {/* Footer actions */}
        <div className="border-t border-white/10 px-3 py-2.5 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            className="text-white/50 hover:text-white/80 gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty}
            className={`flex-1 gap-1 ${dirty ? 'bg-amber-500 hover:bg-amber-400 text-black' : ''}`}
          >
            <Save className="w-3.5 h-3.5" />
            {dirty ? 'Save to Map •' : 'Saved'}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = await fileToDataUrl(file);
            patch({ customModelUrl: url, model: undefined });
            e.target.value = '';
          }}
        />
      </div>

      {/* ── 3D Preview ──────────────────────────────────────────────── */}
      {!embedded && (
      <div className="flex-1 relative min-w-0">
        <div ref={hostRef} className="absolute inset-0" />
        {/* Overlay info */}
        <div className="absolute top-3 left-3 pointer-events-none">
          <div className="rounded-lg bg-black/60 px-3 py-1.5 text-[10px] text-white/60 space-y-0.5">
            <p className="font-bold text-amber-300/80 uppercase tracking-wide text-[9px]">
              Weapon Editor Preview
            </p>
            <p>
              <span className="text-amber-200/70">●</span> Yellow sphere = hold point (right hand)
            </p>
            <p>
              <span className="text-sky-300/70">●</span> Blue sphere = back-carry point
            </p>
            <p className="text-white/35">Drag to orbit · Edit Hold/Back tabs to position</p>
          </div>
        </div>
        {/* Position preview badge */}
        <div className="absolute bottom-3 left-3 pointer-events-none">
          <div className="rounded-lg bg-black/60 px-3 py-1.5 text-[10px] text-white/60 font-mono space-y-0.5">
            <p className="text-amber-200/70">Hold pos: [{def.holdPosition.map((v) => v.toFixed(2)).join(', ')}]</p>
            <p className="text-sky-200/70">Back pos: [{def.backPosition.map((v) => v.toFixed(2)).join(', ')}]</p>
          </div>
        </div>
      </div>
      )}
      {embedded && (
        <div className="relative h-44 shrink-0 border-t border-white/10 bg-black/40">
          <div ref={hostRef} className="absolute inset-0" />
          <p className="absolute bottom-1 left-2 text-[9px] text-white/40 pointer-events-none">
            Drag to orbit · Hold / Back tabs for grip
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab panels ──────────────────────────────────────────────────────────────

function ModelTab({
  def,
  patch,
  fileRef,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const texRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <Section title="Weapon Name" accent="amber">
        <input
          type="text"
          value={def.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-sm text-white"
          placeholder="Weapon name…"
        />
      </Section>

      <Section title="Model Source" accent="amber">
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload GLB
          </button>
          {def.customModelUrl && (
            <button
              type="button"
              onClick={() => patch({ customModelUrl: undefined, model: 'weapon-sword' })}
              className="flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/20"
            >
              <X className="w-3.5 h-3.5" />
              Remove
            </button>
          )}
        </div>
        {def.customModelUrl && !CATALOG_WEAPONS.some((w) => w.modelUrl === def.customModelUrl) ? (
          <p className="text-[10px] text-emerald-300/80 truncate">
            Custom GLB loaded ({Math.round(def.customModelUrl.length / 1024)}kb)
          </p>
        ) : (
          <>
            <p className="text-[10px] text-white/40 mb-1">Or choose catalog model:</p>
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
              {WEAPON_MODELS.map((m) => {
                const cat = CATALOG_WEAPONS.find((w) => w.id === m);
                return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    patch({
                      model: m,
                      customModelUrl: cat ? cat.modelUrl : undefined,
                      name: cat?.label ?? def.name,
                      kind: cat?.kind ?? def.kind,
                      ...(cat?.combat ?? {}),
                    })
                  }
                  className={`rounded-lg border px-2 py-1.5 text-[10px] text-left transition-colors ${
                    def.model === m || def.customModelUrl === cat?.modelUrl
                      ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                      : 'border-white/10 text-white/55 hover:bg-white/5'
                  }`}
                >
                  {cat ? cat.label : m}
                </button>
                );
              })}
            </div>
          </>
        )}
      </Section>

      <Section title="Weapon Texture" accent="amber">
        <p className="text-[10px] text-white/40 mb-1.5 leading-snug">
          Upload a PNG/JPG to recolor the mesh. Download to edit externally, then upload again.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => texRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload texture
          </button>
          {def.textureUrl && (
            <>
              <a
                href={def.textureUrl}
                download={`${def.name || 'weapon'}-texture.png`}
                className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-200 hover:bg-sky-500/20"
              >
                Download
              </a>
              <button
                type="button"
                onClick={() => patch({ textureUrl: undefined })}
                className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-[11px] text-rose-300"
              >
                Clear
              </button>
            </>
          )}
        </div>
        {def.textureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={def.textureUrl}
            alt=""
            className="mt-2 h-16 w-16 rounded border border-white/15 object-cover"
          />
        )}
        <input
          ref={texRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const url = await fileToDataUrl(file);
            if (url) patch({ textureUrl: url });
          }}
        />
      </Section>
    </div>
  );
}

function HoldTab({
  def,
  patch,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[10px] text-white/50 leading-snug">
        <span className="text-amber-300 font-semibold">Preview-only, not wired to gameplay.</span>{' '}
        These sliders move the mesh in this tab&apos;s own preview pane, but the actual in-game
        weapon grip is driven entirely by{' '}
        <span className="text-amber-300 font-semibold">
          Player Model Studio → skin attachments
        </span>{' '}
        — nothing reads Position/Rotation/Scale below at runtime.
      </div>
      <p className="text-[10px] text-white/40 leading-snug">
        Active hold position — where the weapon sits in the right hand during gameplay.
        The yellow sphere in the preview shows this point.
      </p>
      <Section title="Position" accent="amber">
        <Vec3Row
          label="Position (character space)"
          value={def.holdPosition}
          onChange={(v) => patch({ holdPosition: v })}
        />
      </Section>
      <Section title="Rotation" accent="amber">
        <Vec3Row
          label="Rotation (degrees X / Y / Z)"
          value={def.holdRotation}
          step={1}
          onChange={(v) => patch({ holdRotation: v })}
        />
      </Section>
      <Section title="Scale" accent="amber">
        <Vec3Row
          label="Scale"
          value={def.holdScale}
          step={0.05}
          onChange={(v) => patch({ holdScale: v })}
        />
        <button
          type="button"
          onClick={() => patch({ holdScale: [1, 1, 1] })}
          className="text-[10px] text-white/35 hover:text-white/60"
        >
          Reset to 1×
        </button>
      </Section>
      <p className="text-[10px] text-white/35 leading-snug">
        Tip: default hand position is [0.42, 0.92, 0.18]. Bone attachment is applied server-side
        via the skin attachment pipeline.
      </p>
    </div>
  );
}

function BackTab({
  def,
  patch,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[10px] text-white/50 leading-snug">
        <span className="text-amber-300 font-semibold">Preview-only, not wired to gameplay.</span>{' '}
        Same as the Hold tab — the actual in-game back-carry attachment is driven by{' '}
        <span className="text-amber-300 font-semibold">
          Player Model Studio → skin attachments
        </span>
        , not these sliders.
      </div>
      <p className="text-[10px] text-white/40 leading-snug">
        Back-carry position — where the weapon is holstered on the player&apos;s back when not
        actively held. The blue sphere in the preview marks this point.
      </p>
      <Section title="Back Position" accent="sky">
        <Vec3Row
          label="Position (character space)"
          value={def.backPosition}
          onChange={(v) => patch({ backPosition: v })}
        />
      </Section>
      <Section title="Back Rotation" accent="sky">
        <Vec3Row
          label="Rotation (degrees)"
          value={def.backRotation}
          step={1}
          onChange={(v) => patch({ backRotation: v })}
        />
      </Section>
      <Section title="Back Scale" accent="sky">
        <Vec3Row
          label="Scale"
          value={def.backScale}
          step={0.05}
          onChange={(v) => patch({ backScale: v })}
        />
        <button
          type="button"
          onClick={() => patch({ backScale: [1, 1, 1] })}
          className="text-[10px] text-white/35 hover:text-white/60"
        >
          Reset to 1×
        </button>
      </Section>
    </div>
  );
}

function CombatTab({
  def,
  patch,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[10px] text-white/50 leading-snug">
        <span className="text-amber-300 font-semibold">Only takes effect once.</span> These stats
        seed the map&apos;s Buy Menu weapon entry the{' '}
        <span className="text-amber-300 font-semibold">first time it&apos;s saved</span> — after
        that, the Buy Menu item is the live source of truth and further edits here have no
        in-game effect. To retune a weapon post-launch, edit it directly in{' '}
        <span className="text-amber-300 font-semibold">Map Editor → Buy Menu</span>.
      </div>
      <Section title="Weapon Type" accent="rose">
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: 'melee', label: 'Melee', hint: 'Short-range cone — sword, fists' },
              { id: 'hitscan', label: 'Hitscan', hint: 'Long-range ray — gun, staff' },
              { id: 'cosmetic', label: 'Cosmetic', hint: 'No combat — visual only' },
            ] as const
          ).map((k) => (
            <button
              key={k.id}
              type="button"
              title={k.hint}
              onClick={() => patch({ kind: k.id })}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                def.kind === k.id
                  ? 'bg-rose-500/30 border-rose-400/60 text-rose-100'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Section>

      {def.kind !== 'cosmetic' && (
        <>
          <Section title="Damage & Range" accent="rose">
            <Slider
              label="Damage"
              value={def.damage}
              min={1}
              max={200}
              step={1}
              unit="hp"
              onChange={(v) => patch({ damage: v })}
            />
            <Slider
              label="Range"
              value={def.range}
              min={0.5}
              max={30}
              step={0.1}
              unit="u"
              onChange={(v) => patch({ range: v })}
            />
            <Slider
              label="Cooldown"
              value={def.cooldownMs}
              min={80}
              max={3000}
              step={10}
              unit="ms"
              onChange={(v) => patch({ cooldownMs: v })}
            />
            <Slider
              label="Spread cone"
              value={def.coneRadians}
              min={0.02}
              max={1.2}
              step={0.01}
              unit="rad"
              onChange={(v) => patch({ coneRadians: v })}
            />
            {def.kind === 'hitscan' && (
              <Slider
                label="Bullets / shot (pellets)"
                value={def.bulletsPerShot}
                min={1}
                max={12}
                step={1}
                onChange={(v) => patch({ bulletsPerShot: Math.round(v) })}
              />
            )}
            <div className="space-y-1">
              <p className="text-[9px] text-white/45">Fire mode</p>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'semi', label: 'Semi' },
                    { id: 'bolt', label: 'Bolt' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => patch({ fireMode: m.id })}
                    className={`text-[9px] font-bold py-1.5 rounded border ${
                      (def.fireMode || 'semi') === m.id
                        ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                        : 'border-white/10 text-white/45'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[8px] text-white/30">
                Auto = hold · Semi = 1 click · Bolt = sniper (1 click + zoom)
              </p>
            </div>
            {def.kind === 'hitscan' && (
              <>
                <Slider
                  label="ADS zoom FOV"
                  value={def.adsZoomFov ?? 0}
                  min={0}
                  max={75}
                  step={1}
                  unit="°"
                  onChange={(v) => patch({ adsZoomFov: v })}
                />
                <Slider
                  label="ADS cone ×"
                  value={def.adsConeScale ?? 1}
                  min={0.1}
                  max={2}
                  step={0.05}
                  onChange={(v) => patch({ adsConeScale: v })}
                />
                <Slider
                  label="Hipfire cone ×"
                  value={def.hipfireConeScale ?? 1}
                  min={0.5}
                  max={6}
                  step={0.1}
                  onChange={(v) => patch({ hipfireConeScale: v })}
                />
              </>
            )}
          </Section>

          <Section title="Muzzle Offset" accent="rose">
            <p className="text-[9px] text-white/35 mb-1">
              VFX origin in weapon-local space (tip of barrel / blade).
            </p>
            <Vec3Row
              label="Offset (weapon local)"
              value={def.muzzleOffset}
              onChange={(v) => patch({ muzzleOffset: v })}
            />
          </Section>
        </>
      )}

      <Section title="Attack Style" accent="rose">
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { id: 'attack', label: 'Attack anim', hint: 'Full arm swing' },
              { id: 'punch', label: 'Punch anim', hint: 'Fist / short jab' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              onClick={() => patch({ attackStyle: s.id })}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                def.attackStyle === s.id
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-white/35 mt-1">
          Binds to Attack / Punch clip in Player Model studio animations.
        </p>
      </Section>
    </div>
  );
}

function RecoilTab({
  def,
  patch,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-white/40 leading-snug">
        Per-weapon recoil overrides. Leave at 0 to use the Combat Editor global values.
      </p>
      <Section title="Camera Recoil" accent="orange">
        <Slider
          label="Camera kick"
          value={def.recoilKickDeg ?? 0}
          min={0}
          max={15}
          step={0.5}
          unit="°"
          onChange={(v) => patch({ recoilKickDeg: v || undefined })}
        />
        <p className="text-[9px] text-white/30 mt-0.5">
          0 = use Combat Editor global setting
        </p>
      </Section>
      <Section title="Gun Kick" accent="orange">
        <Slider
          label="Weapon kick Z"
          value={def.weaponKickZ ?? 0}
          min={0}
          max={0.3}
          step={0.005}
          unit="u"
          onChange={(v) => patch({ weaponKickZ: v || undefined })}
        />
        <p className="text-[9px] text-white/30 mt-0.5">
          Local push-back on the weapon mesh per shot. 0 = global setting.
        </p>
      </Section>
    </div>
  );
}

function SwayTab({
  def,
  patch,
  mapDoc,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
  mapDoc: MapDocument;
}) {
  const cs = ensureCombatSettings(mapDoc);
  void def; void patch;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[10px] text-white/50 leading-snug">
        Weapon sway is one setting shared by every weapon on{' '}
        <span className="text-amber-300 font-semibold">this map</span> — tune it in{' '}
        <span className="text-amber-300 font-semibold">Combat Editor → Sway</span> (per-map,
        not account-wide like Powers/Sounds).
        <br />
        Current: {cs.swayEnabled ? `enabled, ${cs.swayAmplitudeDeg}° @ ${cs.swaySpeedHz}Hz` : 'disabled'}.
      </div>
      <p className="text-[9px] text-white/35">
        Per-weapon sway multipliers will be available in a future update.
        For now use the Combat Editor to tune idle and movement sway for this map.
      </p>
    </div>
  );
}

function AnimsTab({
  def,
  patch,
  onPreviewClip,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
  onPreviewClip?: (name?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-white/40 leading-snug">
        Assign clip names from the weapon GLB (if your custom model has animation clips).
        These are played on the weapon mesh itself — separate from the character&apos;s
        attack/punch clip on the Player Model studio.
      </p>
      <Section title="Weapon Clips" accent="violet">
        {(
          [
            { key: 'idleClip', label: 'Idle clip', hint: 'Idle fidget / breathing' },
            { key: 'fireClip', label: 'Fire clip', hint: 'Played on each shot' },
            { key: 'reloadClip', label: 'Reload clip', hint: 'Reload animation' },
            { key: 'equipClip', label: 'Equip clip', hint: 'Played once on weapon switch / draw' },
          ] as const
        ).map(({ key, label, hint }) => (
          <label key={key} className="block text-[10px] text-white/50">
            <span className="block mb-0.5">
              {label}
              <span className="text-white/30 ml-1">— {hint}</span>
            </span>
            <div className="flex gap-1">
              <input
                type="text"
                value={def[key] ?? ''}
                onChange={(e) => patch({ [key]: e.target.value || undefined })}
                placeholder="clip name…"
                className="flex-1 rounded bg-black/40 border border-white/10 px-2 py-1 text-[11px] text-white/80"
              />
              <button
                type="button"
                className="rounded border border-violet-400/40 bg-violet-500/15 px-2 text-[10px] text-violet-200 hover:bg-violet-500/25"
                onClick={() => onPreviewClip?.(def[key])}
                disabled={!def[key]}
              >
                Play
              </button>
            </div>
          </label>
        ))}
      </Section>
      <p className="text-[9px] text-white/35 leading-snug">
        Character attack / punch animations are set in the Player Model studio → Anims tab.
        Weapon clip names must match those in the uploaded GLB exactly. Live matches play
        fire/reload clips when authored here.
      </p>
    </div>
  );
}

function ShopTab({
  def,
  patch,
}: {
  def: MapWeaponDef;
  patch: (p: Partial<MapWeaponDef>) => void;
}) {
  return (
    <div className="space-y-3">
      <Section title="In-Game Shop" accent="emerald">
        <label className="block text-[10px] text-white/50">
          <span className="block mb-0.5">Shop price (game coins, 0 = free / starter)</span>
          <input
            type="number"
            min={0}
            max={9999}
            step={50}
            value={def.shopPrice}
            onChange={(e) => patch({ shopPrice: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
          />
        </label>
      </Section>
      <p className="text-[10px] text-white/35 leading-snug">
        Set price to 0 for the default / free weapon every player starts with.
        Paid weapons appear in the buy-phase menu during Horde / Competitive.
        Use the left-nav Buy Menu tab to enable weapons, set prices, and pick modes.
      </p>
      <div className="rounded-lg border border-sky-400/20 bg-sky-500/5 px-3 py-2 text-[10px] text-white/50 leading-snug">
        <p className="font-semibold text-sky-300/80 mb-1">Buy phase</p>
        <p>
          Buy timers live under Settings → Horde / Competitive. The Buy Menu tab controls
          which weapons appear in the live shop.
        </p>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadWeaponModel(
  def: MapWeaponDef,
  group: THREE.Group
): Promise<THREE.AnimationClip[]> {
  // Clear existing weapon mesh. Each load builds its own fresh GLTFLoader
  // with no shared cache (unlike three-map.ts's cached prefab clones), so
  // every geometry/material/texture here is owned solely by this preview and
  // safe to fully dispose — previously only the top-level child's geometry
  // was checked, but a real GLB is added as `group.add(gltf.scene)` (a
  // THREE.Group with no direct .geometry), so every model swap leaked the
  // previous model's meshes/geometries/materials/textures entirely.
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.normalMap?.dispose();
        std.roughnessMap?.dispose();
        std.metalnessMap?.dispose();
        std.emissiveMap?.dispose();
        std.aoMap?.dispose();
        std.alphaMap?.dispose();
        m.dispose();
      }
    });
  }

  const src = def.customModelUrl ?? (def.model ? weaponModelSrc(def.model) : null);
  if (!src) {
    // Default placeholder: sword blade shape
    const mat = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.8, roughness: 0.2 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.02), mat);
    blade.position.y = 0.3;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.03), mat);
    group.add(blade, guard);
    return [];
  }

  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
      (res, rej) =>
        loader.load(src, res as unknown as Parameters<typeof loader.load>[1], undefined, rej)
    );
    normalizeCharacter(gltf.scene, 0.8);
    if (def.textureUrl) {
      const texLoader = new THREE.TextureLoader();
      try {
        const map = await new Promise<THREE.Texture>((res, rej) =>
          texLoader.load(def.textureUrl!, res, undefined, rej)
        );
        map.colorSpace = THREE.SRGBColorSpace;
        map.flipY = false;
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            if (std && 'map' in std) {
              std.map = map;
              std.needsUpdate = true;
            }
          }
        });
      } catch {
        /* ignore texture load errors in preview */
      }
    }
    group.add(gltf.scene);
    return gltf.animations ?? [];
  } catch {
    // Fallback: orange box
    const mat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.08), mat));
    return [];
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
