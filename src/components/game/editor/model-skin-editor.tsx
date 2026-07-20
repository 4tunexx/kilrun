'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Shirt,
  Upload,
  X,
  Save,
  Plus,
  Trash2,
  ShoppingBag,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorEntity } from './map-document';
import { PROTOTYPE_MODELS } from './prototype-catalog';
import { loadPlayerAvatar } from './player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import { applySkinAttachments } from './skin-attachments';
import {
  baseModelKeyFromEntity,
  defaultAttachment,
  SKIN_ATTACH_SLOTS,
  type PlayerSkinPreset,
  type SkinAttachSlot,
  type SkinAttachment,
} from '@/lib/player-skins';
import {
  createSkinPreset,
  deleteSkinPreset,
  listSkinPresets,
  saveSkinPreset,
  skinPresetShopPayload,
} from './skin-library';

/**
 * Model Editor — author hat/pants/boots/gloves/weapon skins on the chosen
 * player model, save presets, and prepare them for the shop Skins category.
 */
export function ModelSkinEditor({
  entity,
  onClose,
  onApplyToPlayer,
  onPublishToShop,
  isMobile,
}: {
  entity: EditorEntity;
  onClose: () => void;
  /** Persist attachments onto the map player entity for Play Test. */
  onApplyToPlayer: (attachments: SkinAttachment[]) => void;
  /** Optional admin publish hook. */
  onPublishToShop?: (payload: ReturnType<typeof skinPresetShopPayload>) => Promise<void> | void;
  isMobile?: boolean;
}) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<SkinPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<PlayerSkinPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slot, setSlot] = useState<SkinAttachSlot>('hat');
  const [attachments, setAttachments] = useState<SkinAttachment[]>([
    defaultAttachment('hat'),
  ]);
  const [name, setName] = useState('New Skin');
  const [price, setPrice] = useState(250);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseKey = baseModelKeyFromEntity(entity);

  const activeAtt =
    attachments.find((a) => a.slot === slot) ?? defaultAttachment(slot);

  useEffect(() => {
    setPresets(listSkinPresets().filter((p) => p.baseModelKey === baseKey || true));
  }, [baseKey]);

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
        if (!previewRef.current) previewRef.current = new SkinPreview(host);
        previewRef.current.setAvatar(loaded.scene);
        await previewRef.current.setAttachments(attachments);
      } catch (err) {
        console.warn('[ModelSkinEditor]', err);
        if (!cancelled) setError('Failed to load player model');
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
    void previewRef.current?.setAttachments(attachments);
  }, [attachments]);

  useEffect(() => {
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  const patchActive = (partial: Partial<SkinAttachment>) => {
    setAttachments((prev) => {
      const exists = prev.some((a) => a.slot === slot);
      if (!exists) return [...prev, { ...defaultAttachment(slot), ...partial, slot }];
      return prev.map((a) => (a.slot === slot ? { ...a, ...partial } : a));
    });
  };

  const ensureSlot = (s: SkinAttachSlot) => {
    setSlot(s);
    setAttachments((prev) =>
      prev.some((a) => a.slot === s) ? prev : [...prev, defaultAttachment(s)]
    );
  };

  const removeSlot = (s: SkinAttachSlot) => {
    setAttachments((prev) => prev.filter((a) => a.slot !== s));
    if (slot === s) setSlot('hat');
  };

  const saveCurrent = () => {
    const saved = activeId
      ? saveSkinPreset({
          id: activeId,
          name,
          baseModelKey: baseKey,
          primarySlot: attachments[0]?.slot ?? slot,
          attachments,
          shopPrice: price,
          createdAt: presets.find((p) => p.id === activeId)?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          listedForShop: true,
          thumbnail: previewRef.current?.capture() ?? undefined,
        })
      : createSkinPreset({
          name,
          baseModelKey: baseKey,
          primarySlot: attachments[0]?.slot ?? slot,
          attachments,
        });
    if (!activeId) {
      setActiveId(saved.id);
      saveSkinPreset({ ...saved, shopPrice: price, thumbnail: previewRef.current?.capture() ?? undefined });
    }
    setPresets(listSkinPresets());
    onApplyToPlayer(attachments);
  };

  const loadPreset = (p: PlayerSkinPreset) => {
    setActiveId(p.id);
    setName(p.name);
    setPrice(p.shopPrice ?? 250);
    setAttachments(p.attachments.length ? p.attachments : [defaultAttachment('hat')]);
    setSlot(p.primarySlot);
  };

  const publish = async () => {
    if (!onPublishToShop) return;
    setBusy(true);
    try {
      saveCurrent();
      const preset =
        listSkinPresets().find((p) => p.id === activeId) ??
        createSkinPreset({
          name,
          baseModelKey: baseKey,
          primarySlot: attachments[0]?.slot ?? slot,
          attachments,
        });
      const withMeta = saveSkinPreset({
        ...preset,
        name,
        attachments,
        shopPrice: price,
        thumbnail: previewRef.current?.capture() ?? preset.thumbnail,
        listedForShop: true,
      });
      await onPublishToShop(skinPresetShopPayload(withMeta));
      setPresets(listSkinPresets());
    } finally {
      setBusy(false);
    }
  };

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!url) return;
      patchActive({ customModelUrl: url, model: undefined });
    };
    reader.readAsDataURL(file);
  };

  return (
    <aside
      className={`flex flex-col bg-[#0c121a] border-white/10 text-white shadow-2xl z-[90] ${
        isMobile ? 'absolute inset-0 border-0' : 'relative w-[min(100%,440px)] shrink-0 border-l'
      }`}
      aria-label="Model Editor"
    >
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-white/10 bg-[#121a24]">
        <Shirt className="w-4 h-4 text-amber-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide uppercase text-amber-200 truncate">
            Model Editor
          </p>
          <p className="text-[10px] text-white/45 truncate">
            Skins · hats · gear · shop
          </p>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="relative h-44 shrink-0 border-b border-white/10 bg-[#0a1018]">
        <div ref={canvasHostRef} className="absolute inset-0" />
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
            Loading model…
          </p>
        )}
        {error && (
          <p className="absolute bottom-2 left-2 right-2 text-[10px] text-red-300">{error}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/45">Skin name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">Body slots</p>
          <div className="flex flex-wrap gap-1.5">
            {SKIN_ATTACH_SLOTS.map((s) => {
              const on = attachments.some((a) => a.slot === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ensureSlot(s.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
                    slot === s.id
                      ? 'bg-amber-500/30 border-amber-400/60 text-amber-100'
                      : on
                        ? 'bg-white/10 border-white/20 text-white/80'
                        : 'bg-transparent border-white/10 text-white/45'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-white/40 mt-1">{skinSlotMetaHint(slot)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-white/45">
              Mesh for {slot}
            </label>
            <select
              className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
              value={activeAtt.model || ''}
              onChange={(e) =>
                patchActive({
                  model: e.target.value || undefined,
                  customModelUrl: undefined,
                })
              }
            >
              <option value="">— pick prototype mesh —</option>
              {PROTOTYPE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="col-span-2"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload GLB for slot
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
        </div>

        <Vec3Fields
          label="Offset"
          value={activeAtt.position}
          onChange={(position) => patchActive({ position })}
          step={0.05}
        />
        <Vec3Fields
          label="Rotation °"
          value={activeAtt.rotation}
          onChange={(rotation) => patchActive({ rotation })}
          step={5}
        />
        <Vec3Fields
          label="Scale"
          value={activeAtt.scale}
          onChange={(scale) => patchActive({ scale })}
          step={0.05}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => patchActive(defaultAttachment(slot))}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset slot
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => removeSlot(slot)}
            disabled={attachments.length <= 1}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/45">
            Shop VP price
          </label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" onClick={saveCurrent} className="bg-sky-600 hover:bg-sky-500">
            <Save className="w-4 h-4 mr-1" /> Save skin + apply to player
          </Button>
          {onPublishToShop && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void publish()}
              className="border border-amber-400/40"
            >
              <ShoppingBag className="w-4 h-4 mr-1" /> Publish to shop (Skins)
            </Button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Saved skins</p>
            <button
              type="button"
              className="text-[10px] text-sky-300 flex items-center gap-1"
              onClick={() => {
                setActiveId(null);
                setName('New Skin');
                setAttachments([defaultAttachment('hat')]);
                setSlot('hat');
              }}
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <ul className="space-y-1 max-h-36 overflow-y-auto">
            {presets.length === 0 && (
              <li className="text-[11px] text-white/40 px-1">No skins yet — save one above.</li>
            )}
            {presets.map((p) => (
              <li
                key={p.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs border ${
                  activeId === p.id
                    ? 'border-amber-400/50 bg-amber-500/15'
                    : 'border-white/10 bg-black/25'
                }`}
              >
                <button type="button" className="flex-1 text-left truncate" onClick={() => loadPreset(p)}>
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-white/40 ml-1">· {p.primarySlot}</span>
                </button>
                <button
                  type="button"
                  className="text-red-300/80 hover:text-red-200"
                  onClick={() => {
                    deleteSkinPreset(p.id);
                    setPresets(listSkinPresets());
                    if (activeId === p.id) setActiveId(null);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[10px] text-white/35 leading-relaxed">
          Skins stick to the player model you selected ({baseKey}). Equip from inventory
          after purchase — attachments follow the body in Play Test and matches.
        </p>
      </div>
    </aside>
  );
}

function skinSlotMetaHint(slot: SkinAttachSlot) {
  return SKIN_ATTACH_SLOTS.find((s) => s.id === slot)?.hint ?? '';
}

function Vec3Fields({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step: number;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <label key={axis} className="text-[10px] text-white/40">
            {axis}
            <input
              type="number"
              step={step}
              value={Number(value[i].toFixed(3))}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = Number(e.target.value) || 0;
                onChange(next);
              }}
              className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-xs text-white"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

class SkinPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private avatar: THREE.Object3D | null = null;
  private raf = 0;
  private disposed = false;

  constructor(host: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 1.2, 3.2);
    this.camera.lookAt(0, 0.9, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    this.scene.background = new THREE.Color('#0a1018');
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const resize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 176;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    resize();
    new ResizeObserver(resize).observe(host);
    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      if (this.avatar) this.avatar.rotation.y += 0.008;
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  setAvatar(scene: THREE.Object3D) {
    if (this.avatar) this.avatar.removeFromParent();
    normalizeCharacter(scene, 1.75);
    this.avatar = scene;
    this.scene.add(scene);
  }

  async setAttachments(atts: SkinAttachment[]) {
    if (!this.avatar) return;
    await applySkinAttachments(this.avatar, atts);
  }

  capture(): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
