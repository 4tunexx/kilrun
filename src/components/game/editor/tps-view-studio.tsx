'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Camera,
  Crosshair,
  PersonStanding,
  RotateCcw,
  Save,
  Play,
  X,
  Eye,
  Box,
  Film,
  Upload,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Crosshair as CrosshairHud } from '../ui/crosshair';
import { MapPlayPreview } from './map-play-preview';
import { updateFollowCamera } from '../renderer/three-world';
import { normalizeCharacter } from '../renderer/asset-loader';
import {
  DEFAULT_TPS_VIEW,
  loadTpsViewSettings,
  saveTpsViewSettings,
  sanitizeTpsView,
  type TpsViewSettings,
} from '../tps/tps-view-settings';
import type { EditorEntity, MapDocument, PlayerAnimSlot } from './map-document';
import {
  PLAYER_ANIM_SLOTS,
  suggestPlayerBindings,
} from './map-document';
import { PROTOTYPE_MODELS } from './prototype-catalog';
import { loadPlayerAvatar } from './player-avatar';

type Tab = 'camera' | 'crosshair' | 'player' | 'model' | 'anims';

const AVATAR_MODELS = PROTOTYPE_MODELS.filter(
  (m) => /figurine|character|dude|man|human|player|npc/i.test(m) || m === 'figurine'
);

function SliderRow({
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
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-[10px] text-white/55">
        <span>{label}</span>
        <span className="tabular-nums text-cyan-200/90">
          {Number.isInteger(step) ? value : value.toFixed(step < 0.01 ? 3 : 2)}
          {unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * Map-editor 3rd-person view lab. **Save to game** writes global settings that
 * override Play Test + live match camera / crosshair / player framing.
 */
export function TpsViewStudio({
  isMobile,
  onClose,
  onPlayTest,
  mapDoc,
  mapOverride,
  onSaveToMap,
  playerEntity,
  onChangePlayer,
  onOpenFullPlayerStudio,
}: {
  isMobile?: boolean;
  onClose: () => void;
  onPlayTest?: () => void;
  mapDoc?: MapDocument;
  mapOverride?: TpsViewSettings | null;
  onSaveToMap?: (settings: TpsViewSettings) => void;
  /** Map player avatar — model + anim bindings. */
  playerEntity?: EditorEntity | null;
  onChangePlayer?: (patch: Partial<EditorEntity>) => void;
  onOpenFullPlayerStudio?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<TpsViewSettings>(loadTpsViewSettings());
  const playerRef = useRef(playerEntity);
  playerRef.current = playerEntity ?? null;
  const [settings, setSettings] = useState<TpsViewSettings>(() => loadTpsViewSettings());
  const [tab, setTab] = useState<Tab>('camera');
  const [dirty, setDirty] = useState(false);
  const [yaw, setYaw] = useState(0.35);
  const [pitch, setPitch] = useState(settings.camera.defaultPitch);
  const [clips, setClips] = useState<string[]>([]);
  const [modelBusy, setModelBusy] = useState(false);
  const [previewSkins, setPreviewSkins] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarReloadToken = useRef(0);

  settingsRef.current = settings;

  const patch = useCallback((mutator: (s: TpsViewSettings) => void) => {
    setSettings((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return sanitizeTpsView(next);
    });
    setDirty(true);
  }, []);

  const persistGlobal = () => {
    saveTpsViewSettings(settings);
    setDirty(false);
  };

  const resetDefaults = () => {
    setSettings(structuredClone(DEFAULT_TPS_VIEW));
    setPitch(DEFAULT_TPS_VIEW.camera.defaultPitch);
    setDirty(true);
  };

  const loadFromMap = () => {
    if (!mapOverride) return;
    setSettings(sanitizeTpsView(mapOverride));
    setPitch(mapOverride.camera?.defaultPitch ?? DEFAULT_TPS_VIEW.camera.defaultPitch);
    setDirty(true);
  };

  // Live Three preview
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (mapDoc) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1220);
    scene.fog = new THREE.FogExp2(0x0c1830, 0.02);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 80);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xa8c8e8, 0x1a2030, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.9);
    sun.position.set(4, 10, 2);
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    // Simple fallback body (swapped for real avatar when available)
    const player = new THREE.Group();
    player.name = '__tps_preview_player__';
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5ec8ff, roughness: 0.45 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), bodyMat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), bodyMat);
    head.position.y = 1.72;
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
    );
    marker.position.set(0, 1.72, 0.28);
    player.add(torso, head, marker);
    scene.add(player);

    let avatarRoot: THREE.Object3D | null = null;
    let avatarBaseScale = 1;
    const reloadAvatar = async () => {
      const token = ++avatarReloadToken.current;
      const ent = playerRef.current;
      try {
        const loaded = await loadPlayerAvatar(ent ?? undefined);
        if (disposed || token !== avatarReloadToken.current) return;
        if (avatarRoot) {
          scene.remove(avatarRoot);
          avatarRoot = null;
        }
        const root = loaded.scene;
        normalizeCharacter(root, 1.75);
        avatarBaseScale = root.scale.x || 1;
        scene.add(root);
        avatarRoot = root;
        player.visible = false;
        setClips(loaded.clipNames);
      } catch {
        if (avatarRoot) {
          scene.remove(avatarRoot);
          avatarRoot = null;
        }
        avatarBaseScale = 1;
        player.visible = true;
      }
    };
    void reloadAvatar();
    (host as HTMLDivElement & { __reloadAvatar?: () => void }).__reloadAvatar = () => {
      void reloadAvatar();
    };

    // Boom viz
    const boomGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    const boomLine = new THREE.Line(
      boomGeom,
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7 })
    );
    scene.add(boomLine);

    let disposed = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let localYaw = 0.35;
    let localPitch = settingsRef.current.camera.defaultPitch;
    const target = new THREE.Vector3(0, 0, 0);
    const clock = new THREE.Clock();

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const sens = (settingsRef.current.camera.mouseSensDeg * Math.PI) / 180;
      localYaw -= dx * sens * 1.8;
      localPitch -= dy * sens * 1.8;
      const cam = settingsRef.current.camera;
      localPitch = THREE.MathUtils.clamp(localPitch, cam.pitchMin, cam.pitchMax);
      setYaw(localYaw);
      setPitch(localPitch);
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('pointermove', onMove);

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tick = () => {
      if (disposed) return;
      requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const s = settingsRef.current;
      const pl = s.player;
      const body = avatarRoot ?? player;
      const entityScale = playerRef.current?.scale?.[1] ?? 1;

      body.scale.setScalar((avatarRoot ? avatarBaseScale : 1) * entityScale * pl.scale);
      body.position.y = pl.offsetY;
      body.rotation.y = localYaw + (pl.yawOffsetDeg * Math.PI) / 180;

      updateFollowCamera(camera, target, localYaw, localPitch, dt, s.camera);

      const hide =
        pl.hideWhenClose && s.camera.boomDistance < pl.hideDistance;
      body.visible = !hide;
      if (avatarRoot) player.visible = false;
      else if (!hide) player.visible = true;

      // Update boom line: head → camera
      const headY = s.camera.lookHeight;
      const positions = boomLine.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, 0, headY, 0);
      positions.setXYZ(1, camera.position.x, camera.position.y, camera.position.z);
      positions.needsUpdate = true;

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointermove', onMove);
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [mapDoc]);

  // Sync pitch when default pitch slider changes
  useEffect(() => {
    setPitch(settings.camera.defaultPitch);
  }, [settings.camera.defaultPitch]);

  // Reload preview avatar when map player model / custom URL changes
  useEffect(() => {
    const host = hostRef.current as (HTMLDivElement & { __reloadAvatar?: () => void }) | null;
    host?.__reloadAvatar?.();
  }, [playerEntity?.model, playerEntity?.customModelUrl, playerEntity?.id]);

  const selectModel = async (model: string, customModelUrl?: string) => {
    if (!onChangePlayer) return;
    setModelBusy(true);
    try {
      onChangePlayer({
        model,
        customModelUrl: customModelUrl || undefined,
      });
      // Suggest anim bindings after load
      const loaded = await loadPlayerAvatar({
        ...(playerEntity ?? {}),
        model,
        customModelUrl,
      } as EditorEntity);
      setClips(loaded.clipNames);
      if (!playerEntity?.playerAnims || Object.keys(playerEntity.playerAnims).length === 0) {
        onChangePlayer({
          model,
          customModelUrl: customModelUrl || undefined,
          playerAnims: suggestPlayerBindings(loaded.clipNames),
        });
      }
    } finally {
      setModelBusy(false);
      const host = hostRef.current as (HTMLDivElement & { __reloadAvatar?: () => void }) | null;
      host?.__reloadAvatar?.();
    }
  };

  const setAnimSlot = (slot: PlayerAnimSlot, clip: string) => {
    if (!onChangePlayer || !playerEntity) return;
    onChangePlayer({
      playerAnims: { ...(playerEntity.playerAnims ?? {}), [slot]: clip || undefined },
    });
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'camera', label: 'Cam', icon: <Camera className="w-3.5 h-3.5" /> },
    { id: 'crosshair', label: 'Aim', icon: <Crosshair className="w-3.5 h-3.5" /> },
    { id: 'player', label: 'Frame', icon: <PersonStanding className="w-3.5 h-3.5" /> },
    { id: 'model', label: 'Model', icon: <Box className="w-3.5 h-3.5" /> },
    { id: 'anims', label: 'Anims', icon: <Film className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      className={`flex flex-col bg-[#0b1220] border-l border-white/10 ${
        isMobile
          ? 'fixed inset-0 z-[80]'
          : mapDoc
            ? 'w-[min(820px,72vw)] shrink-0 h-full max-h-full'
            : 'w-[min(420px,42vw)] shrink-0 h-full max-h-full'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/30">
        <Eye className="w-4 h-4 text-violet-300" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white tracking-wide">3rd View</p>
          <p className="text-[10px] text-white/45 truncate">
            Preview the real map + camera framing used in Play Test / match
          </p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-white/70" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className={mapDoc && !isMobile ? 'flex flex-1 min-h-0' : 'contents'}>
      <div
        className={`relative shrink-0 border-b border-white/10 bg-black/40 ${
          mapDoc
            ? isMobile
              ? 'h-[42vh]'
              : 'h-auto flex-1 min-w-0 border-b-0 border-r'
            : 'h-[220px]'
        }`}
      >
        {mapDoc ? (
          <MapPlayPreview
            doc={mapDoc}
            embedded
            tpsViewOverride={settings}
            previewSkins={previewSkins}
          />
        ) : (
          <div ref={hostRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
        )}
        <CrosshairHud visible style={settings.crosshair} />
        <p className="absolute bottom-2 left-2 text-[9px] text-white/40 pointer-events-none">
          {mapDoc ? 'WASD / arrows in real map preview' : 'Drag to look · boom cyan'}
        </p>
        <p className="absolute bottom-2 right-2 text-[9px] text-cyan-200/50 tabular-nums pointer-events-none">
          yaw {(yaw * 180) / Math.PI | 0}° · pitch {((pitch * 180) / Math.PI).toFixed(0)}°
        </p>
      </div>

      <div className={mapDoc && !isMobile ? 'w-[320px] shrink-0 flex flex-col min-h-0' : 'contents'}>
      <div className="flex border-b border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors ${
              tab === t.id
                ? 'bg-violet-600/30 text-violet-100 border-b-2 border-violet-400'
                : 'text-white/45 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {tab === 'camera' && (
          <>
            <SliderRow
              label="Boom distance"
              value={settings.camera.boomDistance}
              min={1.5}
              max={12}
              step={0.1}
              unit=" m"
              onChange={(v) => patch((s) => { s.camera.boomDistance = v; })}
            />
            <SliderRow
              label="Look height (head)"
              value={settings.camera.lookHeight}
              min={0.6}
              max={2.4}
              step={0.05}
              unit=" m"
              onChange={(v) => patch((s) => { s.camera.lookHeight = v; })}
            />
            <SliderRow
              label="Shoulder offset"
              value={settings.camera.shoulder}
              min={-1.5}
              max={1.5}
              step={0.05}
              unit=" m"
              onChange={(v) => patch((s) => { s.camera.shoulder = v; })}
            />
            <SliderRow
              label="Default pitch"
              value={settings.camera.defaultPitch}
              min={-0.9}
              max={0.4}
              step={0.01}
              onChange={(v) => patch((s) => { s.camera.defaultPitch = v; })}
            />
            <SliderRow
              label="Pitch min (look down)"
              value={settings.camera.pitchMin}
              min={-1.4}
              max={-0.2}
              step={0.01}
              onChange={(v) => patch((s) => { s.camera.pitchMin = v; })}
            />
            <SliderRow
              label="Pitch max (look up)"
              value={settings.camera.pitchMax}
              min={0.2}
              max={1.1}
              step={0.01}
              onChange={(v) => patch((s) => { s.camera.pitchMax = v; })}
            />
            <SliderRow
              label="FOV"
              value={settings.camera.fov}
              min={45}
              max={95}
              step={1}
              unit="°"
              onChange={(v) => patch((s) => { s.camera.fov = v; })}
            />
            <SliderRow
              label="Follow sharpness"
              value={settings.camera.followSharpness}
              min={6}
              max={60}
              step={1}
              onChange={(v) => patch((s) => { s.camera.followSharpness = v; })}
            />
            <SliderRow
              label="Mouse sensitivity"
              value={settings.camera.mouseSensDeg}
              min={0.03}
              max={0.35}
              step={0.01}
              unit="°/px"
              onChange={(v) => patch((s) => { s.camera.mouseSensDeg = v; })}
            />
          </>
        )}

        {tab === 'crosshair' && (
          <>
            <SliderRow
              label="Arm length"
              value={settings.crosshair.size}
              min={2}
              max={24}
              step={1}
              unit=" px"
              onChange={(v) => patch((s) => { s.crosshair.size = v; })}
            />
            <SliderRow
              label="Center gap"
              value={settings.crosshair.gap}
              min={0}
              max={20}
              step={1}
              unit=" px"
              onChange={(v) => patch((s) => { s.crosshair.gap = v; })}
            />
            <SliderRow
              label="Thickness"
              value={settings.crosshair.thickness}
              min={1}
              max={5}
              step={1}
              unit=" px"
              onChange={(v) => patch((s) => { s.crosshair.thickness = v; })}
            />
            <SliderRow
              label="Opacity"
              value={settings.crosshair.opacity}
              min={0.2}
              max={1}
              step={0.05}
              onChange={(v) => patch((s) => { s.crosshair.opacity = v; })}
            />
            <label className="flex items-center justify-between text-[11px] text-white/60">
              Color
              <input
                type="color"
                value={settings.crosshair.color}
                onChange={(e) => patch((s) => { s.crosshair.color = e.target.value; })}
                className="h-7 w-12 rounded border border-white/20 bg-transparent cursor-pointer"
              />
            </label>
            {(
              [
                ['showDot', 'Center dot'],
                ['showLines', 'Cross lines'],
                ['showRing', 'Outer ring'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between text-[11px] text-white/60"
              >
                {label}
                <input
                  type="checkbox"
                  checked={!!settings.crosshair[key]}
                  onChange={(e) =>
                    patch((s) => {
                      s.crosshair[key] = e.target.checked;
                    })
                  }
                  className="accent-violet-400"
                />
              </label>
            ))}
          </>
        )}

        {tab === 'player' && (
          <>
            <SliderRow
              label="Model scale"
              value={settings.player.scale}
              min={0.6}
              max={1.6}
              step={0.02}
              onChange={(v) => patch((s) => { s.player.scale = v; })}
            />
            <SliderRow
              label="Vertical offset"
              value={settings.player.offsetY}
              min={-0.5}
              max={0.8}
              step={0.02}
              unit=" m"
              onChange={(v) => patch((s) => { s.player.offsetY = v; })}
            />
            <SliderRow
              label="Yaw offset"
              value={settings.player.yawOffsetDeg}
              min={-45}
              max={45}
              step={1}
              unit="°"
              onChange={(v) => patch((s) => { s.player.yawOffsetDeg = v; })}
            />
            <label className="flex items-center justify-between text-[11px] text-white/60">
              Preview map player skins
              <input
                type="checkbox"
                checked={previewSkins}
                onChange={(e) => setPreviewSkins(e.target.checked)}
                className="accent-violet-400"
              />
            </label>
            <p className="text-[10px] text-white/35 leading-relaxed">
              Off by default so editor-only skins do not appear unless you explicitly preview the
              map player&apos;s saved attachments.
            </p>
            <label className="flex items-center justify-between text-[11px] text-white/60">
              Hide body when zoomed in
              <input
                type="checkbox"
                checked={settings.player.hideWhenClose}
                onChange={(e) =>
                  patch((s) => {
                    s.player.hideWhenClose = e.target.checked;
                  })
                }
                className="accent-violet-400"
              />
            </label>
            {settings.player.hideWhenClose && (
              <SliderRow
                label="Hide under boom distance"
                value={settings.player.hideDistance}
                min={0.8}
                max={3.5}
                step={0.1}
                unit=" m"
                onChange={(v) => patch((s) => { s.player.hideDistance = v; })}
              />
            )}
            <p className="text-[10px] text-white/40 leading-relaxed">
              Scale / offset apply in Play Test and live matches on top of your avatar.
              Movement: free look orbits you · hold RMB to aim (strafe, no turn) · release to
              walk with facing · W/A/S/D.
            </p>
          </>
        )}

        {tab === 'model' && (
          <>
            {!onChangePlayer || !playerEntity ? (
              <p className="text-[11px] text-amber-200/80">
                No player avatar on this map yet. Open Player Model once, or place a Player entity.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-white/45">
                  Current: <span className="text-cyan-200">{playerEntity.model || 'default'}</span>
                  {modelBusy ? ' · loading…' : ''}
                </p>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {AVATAR_MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={modelBusy}
                      onClick={() => void selectModel(m)}
                      className={`text-left text-[10px] px-2 py-1.5 rounded border truncate ${
                        playerEntity.model === m
                          ? 'border-violet-400 bg-violet-600/30 text-white'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const url = String(reader.result || '');
                      if (url) void selectModel('custom', url);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full h-8 text-[11px]"
                  disabled={modelBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" /> Upload GLB
                </Button>
                {onOpenFullPlayerStudio && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full h-8 text-[11px]"
                    onClick={onOpenFullPlayerStudio}
                  >
                    Open full Player Model studio
                  </Button>
                )}
              </>
            )}
          </>
        )}

        {tab === 'anims' && (
          <>
            {!playerEntity || !onChangePlayer ? (
              <p className="text-[11px] text-amber-200/80">Select a model first (Model tab).</p>
            ) : (
              <>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[10px] flex-1"
                    onClick={() => {
                      if (!clips.length) return;
                      onChangePlayer({
                        playerAnims: suggestPlayerBindings(clips),
                      });
                    }}
                  >
                    <Wand2 className="w-3 h-3 mr-1" /> Auto-bind clips
                  </Button>
                  {onOpenFullPlayerStudio && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[10px]"
                      onClick={onOpenFullPlayerStudio}
                    >
                      Advanced
                    </Button>
                  )}
                </div>
                {clips.length === 0 ? (
                  <p className="text-[10px] text-white/40">
                    No clips found on this model — upload an animated GLB or use Auto-bind after
                    load.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {PLAYER_ANIM_SLOTS.map((slot) => (
                      <label key={slot.id} className="block space-y-0.5">
                        <span className="text-[10px] text-white/55">{slot.label}</span>
                        <select
                          className="w-full h-7 rounded bg-black/40 border border-white/15 text-[11px] text-white px-1"
                          value={playerEntity.playerAnims?.[slot.id] ?? ''}
                          onChange={(e) => setAnimSlot(slot.id, e.target.value)}
                        >
                          <option value="">—</option>
                          {clips.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 p-2 space-y-2 bg-black/40">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="flex-1 bg-violet-600 hover:bg-violet-500 text-white h-8 text-[11px]"
            onClick={persistGlobal}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {dirty ? 'Save → overrides game' : 'Saved (live)'}
          </Button>
          {onSaveToMap && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-[11px]"
              onClick={() => {
                persistGlobal();
                onSaveToMap(settings);
              }}
              title="Also embed these settings in this map"
            >
              Save to map
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-[11px]"
            onClick={resetDefaults}
            title="Reset to Kilrun defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex gap-1.5">
          {mapOverride && (
            <Button size="sm" variant="secondary" className="h-8 text-[11px] flex-1" onClick={loadFromMap}>
              Load map override
            </Button>
          )}
          {onPlayTest && (
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-[11px]"
              onClick={() => {
                persistGlobal();
                onPlayTest();
              }}
            >
              <Play className="w-3.5 h-3.5 mr-1" /> Test in Play
            </Button>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
