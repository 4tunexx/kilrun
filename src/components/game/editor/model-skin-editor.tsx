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
  Box,
  Palette,
  Image as ImageIcon,
  Eye,
  EyeOff,
  CirclePlus,
  CircleMinus,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorEntity } from './map-document';
import { PROTOTYPE_MODELS } from './prototype-catalog';
import { loadPlayerAvatar } from './player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import {
  applySkinAttachments,
  buildSkinPartMesh,
  captureSkinPartThumbnail,
} from './skin-attachments';
import {
  applySculptStroke,
  findSculptMesh,
  readSculptData,
} from './skin-sculpt';
import {
  baseModelKeyFromEntity,
  defaultAttachment,
  DEFAULT_SKIN_MATERIAL,
  SKIN_ATTACH_SLOTS,
  SKIN_PRIMITIVES,
  type PlayerSkinPreset,
  type SkinAttachSlot,
  type SkinAttachment,
  type SkinMaterial,
  type SkinPrimitive,
  type SkinSculptBrush,
  type SkinShapeParams,
} from '@/lib/player-skins';
import {
  createSkinPreset,
  deleteSkinPreset,
  listSkinPresets,
  saveSkinPreset,
  skinPresetShopPayload,
} from './skin-library';

type SourceMode = 'sculpt' | 'catalog' | 'upload';

/**
 * Self-contained Model Editor — sculpt primitives, paint materials/textures,
 * save skin-only presets with part thumbnails for the shop.
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
  onApplyToPlayer: (attachments: SkinAttachment[]) => void;
  onPublishToShop?: (payload: ReturnType<typeof skinPresetShopPayload>) => Promise<void> | void;
  isMobile?: boolean;
}) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<SkinPreview | null>(null);
  const glbFileRef = useRef<HTMLInputElement>(null);
  const texFileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<SkinAttachSlot>('hat');
  const [presets, setPresets] = useState<PlayerSkinPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slot, setSlot] = useState<SkinAttachSlot>('hat');
  slotRef.current = slot;
  const [attachments, setAttachments] = useState<SkinAttachment[]>([
    defaultAttachment('hat'),
  ]);
  const [name, setName] = useState('New Hat Skin');
  const [price, setPrice] = useState(250);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [sourceMode, setSourceMode] = useState<SourceMode>('sculpt');
  const [blobBrush, setBlobBrush] = useState<SkinSculptBrush | null>('add');
  const [brushRadius, setBrushRadius] = useState(0.12);
  const [brushStrength, setBrushStrength] = useState(0.55);
  const baseKey = baseModelKeyFromEntity(entity);

  const activeAtt =
    attachments.find((a) => a.slot === slot) ?? defaultAttachment(slot);
  const material: SkinMaterial = {
    ...DEFAULT_SKIN_MATERIAL,
    ...activeAtt.material,
    color: activeAtt.material?.color || activeAtt.color || DEFAULT_SKIN_MATERIAL.color,
  };
  const shape: SkinShapeParams = activeAtt.shape ?? {};

  useEffect(() => {
    setPresets(listSkinPresets());
  }, [baseKey]);

  useEffect(() => {
    // Sync source mode tabs from active attachment
    if (activeAtt.customModelUrl) setSourceMode('upload');
    else if (activeAtt.model) setSourceMode('catalog');
    else setSourceMode('sculpt');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, activeAtt.model, activeAtt.customModelUrl, activeAtt.primitive]);

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
        if (!previewRef.current) {
          previewRef.current = new SkinPreview(host, {
            onSculptCommit: (data) => {
              setAttachments((prev) =>
                prev.map((a) =>
                  a.slot === slotRef.current ? { ...a, sculpt: data } : a
                )
              );
            },
          });
        }
        previewRef.current.setAvatar(loaded.scene);
        previewRef.current.setShowAvatar(showAvatar);
        await previewRef.current.setAttachments(attachments, slot);
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
    void previewRef.current?.setAttachments(attachments, slot);
  }, [attachments, slot]);

  useEffect(() => {
    previewRef.current?.setShowAvatar(showAvatar);
  }, [showAvatar]);

  useEffect(() => {
    previewRef.current?.setBlobBrush(
      blobBrush
        ? { brush: blobBrush, radius: brushRadius, strength: brushStrength }
        : null
    );
  }, [blobBrush, brushRadius, brushStrength]);

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

  const patchMaterial = (partial: Partial<SkinMaterial>) => {
    patchActive({
      material: { ...material, ...partial },
      color: partial.color ?? material.color,
    });
  };

  const patchShape = (partial: SkinShapeParams) => {
    patchActive({ shape: { ...shape, ...partial }, sculpt: undefined });
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

  const usePrimitive = (prim: SkinPrimitive) => {
    const meta = SKIN_ATTACH_SLOTS.find((x) => x.id === slot)!;
    patchActive({
      primitive: prim,
      shape: { ...meta.defaultShape },
      model: undefined,
      customModelUrl: undefined,
      sculpt: undefined,
      material: activeAtt.material ?? { ...DEFAULT_SKIN_MATERIAL },
    });
    setSourceMode('sculpt');
  };

  const captureThumb = async (): Promise<string | undefined> => {
    const part = attachments.find((a) => a.slot === slot) ?? attachments[0];
    if (!part) return previewRef.current?.capture() ?? undefined;
    const solo = await captureSkinPartThumbnail(part, 320);
    return solo ?? previewRef.current?.capture() ?? undefined;
  };

  const saveCurrent = async () => {
    const thumb = await captureThumb();
    const primary = attachments[0]?.slot ?? slot;
    const saved = activeId
      ? saveSkinPreset({
          id: activeId,
          name,
          baseModelKey: baseKey,
          primarySlot: slot || primary,
          attachments,
          shopPrice: price,
          createdAt: presets.find((p) => p.id === activeId)?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          listedForShop: true,
          thumbnail: thumb,
        })
      : (() => {
          const created = createSkinPreset({
            name,
            baseModelKey: baseKey,
            primarySlot: slot || primary,
            attachments,
          });
          return saveSkinPreset({
            ...created,
            shopPrice: price,
            thumbnail: thumb,
            primarySlot: slot,
          });
        })();
    setActiveId(saved.id);
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
      await saveCurrent();
      const thumb = await captureThumb();
      const preset =
        listSkinPresets().find((p) => p.id === activeId) ??
        createSkinPreset({
          name,
          baseModelKey: baseKey,
          primarySlot: slot,
          attachments,
        });
      const withMeta = saveSkinPreset({
        ...preset,
        name,
        attachments,
        primarySlot: slot,
        shopPrice: price,
        thumbnail: thumb ?? preset.thumbnail,
        listedForShop: true,
      });
      await onPublishToShop(skinPresetShopPayload(withMeta));
      setPresets(listSkinPresets());
    } finally {
      setBusy(false);
    }
  };

  const onUploadGlb = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!url) return;
      patchActive({
        customModelUrl: url,
        model: undefined,
        primitive: undefined,
      });
      setSourceMode('upload');
    };
    reader.readAsDataURL(file);
  };

  const onUploadTex = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!url) return;
      patchActive({ textureUrl: url });
    };
    reader.readAsDataURL(file);
  };

  return (
    <aside
      className={`flex flex-col bg-[#0c121a] border-white/10 text-white shadow-2xl z-[90] ${
        isMobile ? 'absolute inset-0 border-0' : 'relative w-[min(100%,460px)] shrink-0 border-l'
      }`}
      aria-label="Model Editor"
    >
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-white/10 bg-[#121a24]">
        <Shirt className="w-4 h-4 text-amber-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide uppercase text-amber-200 truncate">
            Model Editor
          </p>
          <p className="text-[10px] text-white/45 truncate">Sculpt · paint · texture · shop</p>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10"
          title={showAvatar ? 'Hide body (skin only)' : 'Show body'}
          onClick={() => setShowAvatar((v) => !v)}
        >
          {showAvatar ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="relative h-52 shrink-0 border-b border-white/10 bg-[#0a1018]">
        <div ref={canvasHostRef} className="absolute inset-0" />
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
            Loading…
          </p>
        )}
        {error && (
          <p className="absolute bottom-2 left-2 right-2 text-[10px] text-red-300">{error}</p>
        )}
        <p className="absolute top-2 left-2 text-[9px] uppercase tracking-wider text-white/40 bg-black/50 px-1.5 py-0.5 rounded">
          {showAvatar ? 'On body' : 'Skin only'}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/45">Skin name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm"
            placeholder="e.g. Golden Cap"
          />
        </div>

        {/* Slots */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">Body slot</p>
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
        </div>

        {/* Source mode */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5 flex items-center gap-1">
            <Box className="w-3 h-3" /> Create / source
          </p>
          <div className="flex gap-1 mb-2">
            {(
              [
                ['sculpt', 'Sculpt'],
                ['catalog', 'Catalog'],
                ['upload', 'Upload'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSourceMode(id)}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase border ${
                  sourceMode === id
                    ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                    : 'border-white/10 text-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sourceMode === 'sculpt' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {SKIN_PRIMITIVES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => usePrimitive(p.id)}
                    className={`px-2 py-1 rounded text-[10px] border ${
                      activeAtt.primitive === p.id && !activeAtt.model && !activeAtt.customModelUrl
                        ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
                        : 'border-white/10 text-white/55 hover:bg-white/5'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <ShapeFields
                primitive={activeAtt.primitive ?? 'box'}
                shape={shape}
                onChange={patchShape}
              />

              {/* ZBrush-lite blob brushes */}
              <div className="mt-2 space-y-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/5 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-fuchsia-200/90 font-bold">
                  Blob sculpt (paint on mesh)
                </p>
                <p className="text-[10px] text-white/40 leading-snug">
                  Drag on the preview to add or remove clay. Tip: hide body (eye icon) for a clearer
                  view. Works on sculpt primitives.
                </p>
                <div className="flex gap-1.5">
                  {(
                    [
                      ['add', 'Add blob', CirclePlus],
                      ['remove', 'Remove', CircleMinus],
                      ['smooth', 'Smooth', Waves],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setBlobBrush((b) => (b === id ? null : id));
                        setShowAvatar(false);
                        setSourceMode('sculpt');
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-bold border ${
                        blobBrush === id
                          ? 'bg-fuchsia-500/30 border-fuchsia-400/60 text-fuchsia-50'
                          : 'border-white/10 text-white/55'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
                <SliderField
                  label="Brush"
                  value={brushRadius}
                  min={0.04}
                  max={0.35}
                  step={0.01}
                  onChange={setBrushRadius}
                />
                <SliderField
                  label="Power"
                  value={brushStrength}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={setBrushStrength}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={!activeAtt.sculpt}
                    onClick={() => patchActive({ sculpt: undefined })}
                  >
                    Reset clay
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setBlobBrush(null)}
                  >
                    Stop brush
                  </Button>
                </div>
              </div>
            </div>
          )}

          {sourceMode === 'catalog' && (
            <select
              className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs"
              value={activeAtt.model || ''}
              onChange={(e) =>
                patchActive({
                  model: e.target.value || undefined,
                  customModelUrl: undefined,
                  primitive: undefined,
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
          )}

          {sourceMode === 'upload' && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => glbFileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5 mr-1" /> Upload GLB mesh
            </Button>
          )}
          <input
            ref={glbFileRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadGlb(f);
              e.target.value = '';
            }}
          />
        </div>

        {/* Material */}
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/45 flex items-center gap-1">
            <Palette className="w-3 h-3" /> Material
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-white/40">
              Color
              <input
                type="color"
                value={normalizeHex(material.color)}
                onChange={(e) => patchMaterial({ color: e.target.value })}
                className="mt-0.5 block w-full h-8 rounded cursor-pointer bg-transparent border border-white/10"
              />
            </label>
            <label className="text-[10px] text-white/40">
              Pattern color
              <input
                type="color"
                value={normalizeHex(material.patternColor || '#8b6914')}
                onChange={(e) => patchMaterial({ patternColor: e.target.value })}
                className="mt-0.5 block w-full h-8 rounded cursor-pointer bg-transparent border border-white/10"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {(['flat', 'stripes', 'checker', 'gradient'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => patchMaterial({ pattern: p })}
                className={`px-2 py-1 rounded text-[10px] border capitalize ${
                  (material.pattern ?? 'flat') === p
                    ? 'bg-violet-500/25 border-violet-400/50 text-violet-100'
                    : 'border-white/10 text-white/50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <SliderField
            label="Metal"
            value={material.metalness}
            min={0}
            max={1}
            step={0.05}
            onChange={(metalness) => patchMaterial({ metalness })}
          />
          <SliderField
            label="Rough"
            value={material.roughness}
            min={0}
            max={1}
            step={0.05}
            onChange={(roughness) => patchMaterial({ roughness })}
          />
          <SliderField
            label="Opacity"
            value={material.opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(opacity) => patchMaterial({ opacity })}
          />
        </div>

        {/* Texture */}
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/45 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Texture
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => texFileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5 mr-1" /> Upload image
            </Button>
            {activeAtt.textureUrl && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => patchActive({ textureUrl: undefined })}
              >
                Clear
              </Button>
            )}
          </div>
          <input
            ref={texFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadTex(f);
              e.target.value = '';
            }}
          />
          {activeAtt.textureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeAtt.textureUrl}
              alt="Texture preview"
              className="h-16 w-16 rounded object-cover border border-white/15"
            />
          )}
          <p className="text-[10px] text-white/35">
            Upload a PNG/JPG for the hat/gear surface, or use pattern colors above.
          </p>
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

        {/* Fit size — expand/shrink until it matches the body part */}
        <SizeFitControls
          scale={activeAtt.scale}
          onChange={(scale) => patchActive({ scale })}
          slotLabel={SKIN_ATTACH_SLOTS.find((s) => s.id === slot)?.label ?? slot}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              patchActive(defaultAttachment(slot));
              setSourceMode('sculpt');
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset part
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
          <label className="text-[10px] uppercase tracking-wider text-white/45">Shop VP price</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={() => void saveCurrent()}
            className="bg-sky-600 hover:bg-sky-500"
          >
            <Save className="w-4 h-4 mr-1" /> Save skin (thumbnail = this part)
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
                setName('New Hat Skin');
                setAttachments([defaultAttachment('hat')]);
                setSlot('hat');
                setSourceMode('sculpt');
              }}
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {presets.length === 0 && (
              <li className="text-[11px] text-white/40 px-1">
                No skins yet — sculpt a hat above and save.
              </li>
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
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="w-9 h-9 rounded object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded bg-white/5 border border-white/10 shrink-0" />
                )}
                <button
                  type="button"
                  className="flex-1 text-left truncate"
                  onClick={() => loadPreset(p)}
                >
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
          Sculpt a box/cylinder/etc., paint color + texture, then save. Shop cards use a
          thumbnail of <em>this skin part</em> (hat, boots…), not the whole avatar.
        </p>
      </div>
    </aside>
  );
}

function normalizeHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return '#c4a574';
}

function ShapeFields({
  primitive,
  shape,
  onChange,
}: {
  primitive: SkinPrimitive;
  shape: SkinShapeParams;
  onChange: (p: SkinShapeParams) => void;
}) {
  const num = (
    key: keyof SkinShapeParams,
    label: string,
    def: number,
    step = 0.02,
    min = 0.02,
    max = 2
  ) => (
    <label key={key} className="text-[10px] text-white/40">
      {label}
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number(((shape[key] as number | undefined) ?? def).toFixed(3))}
        onChange={(e) => onChange({ [key]: Number(e.target.value) || def })}
        className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-xs text-white"
      />
    </label>
  );

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {(primitive === 'box' || primitive === 'plane') && (
        <>
          {num('width', 'W', 0.4)}
          {num('height', 'H', 0.4)}
          {primitive === 'box' && num('depth', 'D', 0.4)}
        </>
      )}
      {(primitive === 'sphere' ||
        primitive === 'cylinder' ||
        primitive === 'capsule' ||
        primitive === 'cone' ||
        primitive === 'torus') && (
        <>
          {primitive === 'cylinder' ? (
            <>
              {num('radiusTop', 'R top', 0.28)}
              {num('radiusBottom', 'R bot', 0.32)}
              {num('height', 'H', 0.22)}
            </>
          ) : (
            <>
              {num('radius', 'Radius', 0.25)}
              {(primitive === 'capsule' || primitive === 'cone') && num('height', 'H', 0.4)}
              {primitive === 'torus' && num('tube', 'Tube', 0.08)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SizeFitControls({
  scale,
  onChange,
  slotLabel,
}: {
  scale: [number, number, number];
  onChange: (s: [number, number, number]) => void;
  slotLabel: string;
}) {
  const [showAxes, setShowAxes] = useState(false);
  const uniform = Math.max(
    0.05,
    (Math.abs(scale[0]) + Math.abs(scale[1]) + Math.abs(scale[2])) / 3
  );

  const setUniform = (s: number) => {
    const v = Math.min(5, Math.max(0.15, s));
    onChange([v, v, v]);
  };

  const setAxis = (i: 0 | 1 | 2, v: number) => {
    const next = [...scale] as [number, number, number];
    next[i] = Math.min(5, Math.max(0.05, v));
    onChange(next);
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-emerald-200/90 font-bold">
          Fit size · {slotLabel}
        </p>
        <span className="text-[11px] tabular-nums text-emerald-100/80 font-semibold">
          {uniform.toFixed(2)}×
        </span>
      </div>
      <p className="text-[10px] text-white/40 leading-snug">
        Drag to expand until it matches the body. This size is saved with the skin.
      </p>

      <label className="flex items-center gap-2">
        <span className="text-[10px] text-white/45 w-10 shrink-0">Size</span>
        <input
          type="range"
          min={0.25}
          max={3.5}
          step={0.02}
          value={Math.min(3.5, Math.max(0.25, uniform))}
          onChange={(e) => setUniform(Number(e.target.value))}
          className="flex-1 h-2 accent-emerald-400 cursor-pointer"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'Tiny', v: 0.6 },
          { label: 'Small', v: 0.85 },
          { label: 'Fit', v: 1.15 },
          { label: 'Bigger', v: 1.5 },
          { label: 'Huge', v: 2.2 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setUniform(p.v)}
            className={`px-2 py-1 rounded text-[10px] font-bold border ${
              Math.abs(uniform - p.v) < 0.08
                ? 'bg-emerald-500/30 border-emerald-400/50 text-emerald-50'
                : 'border-white/10 text-white/55 hover:bg-white/5'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setUniform(uniform + 0.15)}
          className="px-2 py-1 rounded text-[10px] font-bold border border-white/10 text-white/70 hover:bg-white/5"
          title="Grow a bit"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setUniform(uniform - 0.15)}
          className="px-2 py-1 rounded text-[10px] font-bold border border-white/10 text-white/70 hover:bg-white/5"
          title="Shrink a bit"
        >
          −
        </button>
      </div>

      <button
        type="button"
        className="text-[10px] text-sky-300/90 hover:text-sky-200"
        onClick={() => setShowAxes((v) => !v)}
      >
        {showAxes ? 'Hide' : 'Show'} per-axis scale (X / Y / Z)
      </button>

      {showAxes && (
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          {(['X width', 'Y height', 'Z depth'] as const).map((label, i) => (
            <label key={label} className="flex items-center gap-2">
              <span className="text-[10px] text-white/45 w-16 shrink-0">{label}</span>
              <input
                type="range"
                min={0.15}
                max={3.5}
                step={0.02}
                value={Math.min(3.5, Math.max(0.15, Math.abs(scale[i])))}
                onChange={(e) => setAxis(i as 0 | 1 | 2, Number(e.target.value))}
                className="flex-1 h-1.5 accent-sky-400 cursor-pointer"
              />
              <span className="w-9 text-right text-[10px] tabular-nums text-white/55">
                {scale[i].toFixed(2)}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[10px] text-white/45">
      <span className="w-12 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-amber-400"
      />
      <span className="w-8 text-right tabular-nums text-white/60">{value.toFixed(2)}</span>
    </label>
  );
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
  private soloRoot = new THREE.Group();
  private showBody = true;
  private raf = 0;
  private disposed = false;
  private host: HTMLElement;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private painting = false;
  private brush: { brush: SkinSculptBrush; radius: number; strength: number } | null = null;
  private onSculptCommit?: (data: { positions: number[]; count: number }) => void;
  private commitTimer: number | null = null;
  private spinPaused = false;

  constructor(
    host: HTMLElement,
    opts?: { onSculptCommit?: (data: { positions: number[]; count: number }) => void }
  ) {
    this.host = host;
    this.onSculptCommit = opts?.onSculptCommit;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 1.35, 3.0);
    this.camera.lookAt(0, 1.1, 0);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      touchAction: 'none',
    });
    this.scene.background = new THREE.Color('#0a1018');
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.scene.add(this.soloRoot);
    const resize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 208;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    resize();
    new ResizeObserver(resize).observe(host);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);

    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      if (!this.spinPaused && !this.painting) {
        const spin = this.showBody ? this.avatar : this.soloRoot;
        if (spin) spin.rotation.y += 0.008;
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  setBlobBrush(
    cfg: { brush: SkinSculptBrush; radius: number; strength: number } | null
  ) {
    this.brush = cfg;
    this.spinPaused = Boolean(cfg);
    this.renderer.domElement.style.cursor = cfg ? 'crosshair' : 'default';
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.brush) return;
    e.preventDefault();
    this.painting = true;
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.paintAt(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.painting || !this.brush) return;
    e.preventDefault();
    this.paintAt(e.clientX, e.clientY);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.painting) return;
    this.painting = false;
    try {
      this.renderer.domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    this.flushSculptCommit();
  };

  private paintAt(clientX: number, clientY: number) {
    if (!this.brush) return;
    const targetRoot = this.showBody ? this.avatar : this.soloRoot;
    if (!targetRoot) return;
    const mesh = findSculptMesh(this.soloRoot.visible ? this.soloRoot : targetRoot);
    if (!mesh) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(mesh, true);
    if (!hits.length) return;
    const hitMesh = hits[0].object as THREE.Mesh;
    if (!hitMesh.isMesh) return;
    applySculptStroke(hitMesh, hits[0].point, {
      brush: this.brush.brush,
      radius: this.brush.radius,
      strength: this.brush.strength,
    });
  }

  private flushSculptCommit() {
    const mesh = findSculptMesh(this.soloRoot);
    if (!mesh) return;
    const data = readSculptData(mesh);
    if (data) this.onSculptCommit?.(data);
  }

  setAvatar(scene: THREE.Object3D) {
    if (this.avatar) this.avatar.removeFromParent();
    normalizeCharacter(scene, 1.75);
    this.avatar = scene;
    this.scene.add(scene);
    this.setShowAvatar(this.showBody);
  }

  setShowAvatar(on: boolean) {
    this.showBody = on;
    if (this.avatar) this.avatar.visible = on;
    this.soloRoot.visible = !on;
    if (on) {
      this.camera.position.set(0, 1.35, 3.0);
      this.camera.lookAt(0, 1.1, 0);
    } else {
      this.camera.position.set(0, 0.35, 1.4);
      this.camera.lookAt(0, 0.2, 0);
    }
  }

  async setAttachments(atts: SkinAttachment[], focusSlot?: SkinAttachSlot) {
    if (this.painting) return; // don't rebuild mid-stroke
    if (this.avatar) await applySkinAttachments(this.avatar, atts);
    while (this.soloRoot.children.length) this.soloRoot.remove(this.soloRoot.children[0]);
    const primary =
      (focusSlot ? atts.find((a) => a.slot === focusSlot) : undefined) ?? atts[0];
    if (primary) {
      try {
        const part = await buildSkinPartMesh(primary);
        part.scale.set(...primary.scale);
        // Keep identity rotation for easier sculpt aim; spin group instead
        part.rotation.set(0, 0, 0);
        part.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(part);
        const c = new THREE.Vector3();
        box.getCenter(c);
        part.position.sub(c);
        this.soloRoot.add(part);
      } catch (err) {
        console.warn('[SkinPreview solo]', err);
      }
    }
  }

  capture(): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/jpeg', 0.75);
    } catch {
      return null;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.commitTimer) window.clearTimeout(this.commitTimer);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
