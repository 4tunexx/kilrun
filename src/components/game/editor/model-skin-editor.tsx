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
  Undo2,
  Redo2,
  FlipHorizontal,
  Move3d,
  Paintbrush,
  RotateCw,
  Aperture,
  Maximize2,
  Minimize2,
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
  tickSkinAttachments,
} from './skin-attachments';
import {
  applySculptStroke,
  applySculptDataToGeometry,
  findSculptMesh,
  readSculptData,
} from './skin-sculpt';
import {
  attachmentKey,
  baseModelKeyFromEntity,
  defaultAttachment,
  DEFAULT_SKIN_MATERIAL,
  materialForFeel,
  SKIN_ATTACH_SLOTS,
  SKIN_MATERIAL_FEELS,
  SKIN_PRIMITIVES,
  type PlayerSkinPreset,
  type SkinAttachSlot,
  type SkinAttachment,
  type SkinMaterial,
  type SkinMaterialFeel,
  type SkinPrimitive,
  type SkinSculptBrush,
  type SkinShapeParams,
} from '@/lib/player-skins';
import {
  WEAPON_COMBAT_KINDS,
  defaultCombatForKind,
  resolveWeaponCombat,
  type WeaponCombatConfig,
  type WeaponCombatKind,
} from '@/lib/weapons';
import {
  createSkinPreset,
  deleteSkinPreset,
  listSkinPresets,
  saveSkinPreset,
  skinPresetShopPayload,
} from './skin-library';

type SourceMode = 'sculpt' | 'catalog' | 'upload';
/** Viewport drag: paint clay vs orbit camera around the part. */
type ViewDragMode = 'sculpt' | 'turn';

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
  const activeKeyRef = useRef<string>('hat');
  const [presets, setPresets] = useState<PlayerSkinPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<SkinAttachment[]>(() => {
    if (entity.playerSkins?.length) {
      return entity.playerSkins.map((a) => ({
        ...a,
        id: a.id || a.slot,
        position: [...a.position] as [number, number, number],
        rotation: [...a.rotation] as [number, number, number],
        scale: [...a.scale] as [number, number, number],
      }));
    }
    return [defaultAttachment('hat')];
  });
  const [activeKey, setActiveKey] = useState<string>(() => {
    const first = entity.playerSkins?.[0];
    return first ? attachmentKey(first) : 'hat';
  });
  activeKeyRef.current = activeKey;
  const [name, setName] = useState('New Hat Skin');
  const [price, setPrice] = useState(250);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [viewDragMode, setViewDragMode] = useState<ViewDragMode>('turn');
  const [clayView, setClayView] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('sculpt');
  const [blobBrush, setBlobBrush] = useState<SkinSculptBrush | null>('add');
  const [brushRadius, setBrushRadius] = useState(0.12);
  const [brushStrength, setBrushStrength] = useState(0.55);
  const [symmetryX, setSymmetryX] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const baseKey = baseModelKeyFromEntity(entity);

  const activeAtt =
    attachments.find((a) => attachmentKey(a) === activeKey) ??
    attachments[0] ??
    defaultAttachment('hat');
  const slot = activeAtt.slot;
  const material: SkinMaterial = {
    ...DEFAULT_SKIN_MATERIAL,
    ...activeAtt.material,
    color: activeAtt.material?.color || activeAtt.color || DEFAULT_SKIN_MATERIAL.color,
  };
  const shape: SkinShapeParams = activeAtt.shape ?? {};
  const slotMeta = SKIN_ATTACH_SLOTS.find((s) => s.id === slot);

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
                  attachmentKey(a) === activeKeyRef.current ? { ...a, sculpt: data } : a
                )
              );
            },
            onHistoryChange: (u, r) => {
              setCanUndo(u);
              setCanRedo(r);
            },
          });
        }
        previewRef.current.setAvatar(loaded.scene);
        previewRef.current.setShowAvatar(showAvatar);
        previewRef.current.setViewDragMode(viewDragMode);
        previewRef.current.setClayView(clayView);
        await previewRef.current.setAttachments(attachments, activeKey);
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
    void previewRef.current?.setAttachments(attachments, activeKey);
  }, [attachments, activeKey]);

  useEffect(() => {
    previewRef.current?.setShowAvatar(showAvatar);
  }, [showAvatar]);

  useEffect(() => {
    previewRef.current?.setBlobBrush(
      blobBrush
        ? {
            brush: blobBrush,
            radius: brushRadius,
            strength: brushStrength,
            symmetryX,
          }
        : null
    );
  }, [blobBrush, brushRadius, brushStrength, symmetryX]);

  useEffect(() => {
    previewRef.current?.setViewDragMode(viewDragMode);
  }, [viewDragMode]);

  useEffect(() => {
    previewRef.current?.setClayView(clayView);
  }, [clayView]);

  useEffect(() => {
    // Expand/collapse changes host size — force WebGL resize after layout.
    const id = requestAnimationFrame(() => {
      const host = canvasHostRef.current;
      if (!host) return;
      void host.offsetHeight;
      previewRef.current?.forceResize();
    });
    const id2 = requestAnimationFrame(() => {
      previewRef.current?.forceResize();
    });
    return () => {
      cancelAnimationFrame(id);
      cancelAnimationFrame(id2);
    };
  }, [previewExpanded]);

  useEffect(() => {
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  const patchActive = (partial: Partial<SkinAttachment>) => {
    setAttachments((prev) => {
      const key = activeKeyRef.current;
      const exists = prev.some((a) => attachmentKey(a) === key);
      if (!exists) {
        const created = { ...defaultAttachment(slot), ...partial };
        setActiveKey(attachmentKey(created));
        return [...prev, created];
      }
      return prev.map((a) => (attachmentKey(a) === key ? { ...a, ...partial } : a));
    });
  };

  const patchMaterial = (partial: Partial<SkinMaterial>) => {
    patchActive({
      material: { ...material, ...partial },
      color: partial.color ?? material.color,
    });
  };

  const setFeel = (feel: SkinMaterialFeel) => {
    patchActive({
      feel,
      material: materialForFeel(feel, material),
    });
  };

  const patchShape = (partial: SkinShapeParams) => {
    patchActive({ shape: { ...shape, ...partial }, sculpt: undefined });
  };

  const ensureSlot = (s: SkinAttachSlot) => {
    setAttachments((prev) => {
      const existing = prev.find((a) => a.slot === s);
      if (existing) {
        setActiveKey(attachmentKey(existing));
        return prev;
      }
      const created = defaultAttachment(s);
      setActiveKey(attachmentKey(created));
      return [...prev, created];
    });
  };

  const addCustomPart = () => {
    const created = defaultAttachment('addon');
    setAttachments((prev) => [...prev, created]);
    setActiveKey(attachmentKey(created));
    setShowAvatar(true);
    setViewDragMode('turn');
  };

  const removeActive = () => {
    setAttachments((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((a) => attachmentKey(a) !== activeKey);
      setActiveKey(attachmentKey(next[0]));
      return next;
    });
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
    const part = activeAtt ?? attachments[0];
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
    const atts = p.attachments.length ? p.attachments : [defaultAttachment('hat')];
    setAttachments(atts);
    const primary =
      atts.find((a) => a.slot === p.primarySlot) ?? atts[0];
    setActiveKey(attachmentKey(primary));
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
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className={
          previewExpanded
            ? 'fixed inset-0 z-[200] flex flex-col bg-[#0a1018]'
            : 'relative h-56 shrink-0 border-b border-white/10 bg-[#0a1018]'
        }
      >
        <div
          ref={canvasHostRef}
          className={previewExpanded ? 'absolute inset-0' : 'absolute inset-0'}
        />
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
            Loading…
          </p>
        )}
        {error && (
          <p className="absolute bottom-2 left-2 right-2 text-[10px] text-red-300 z-10">{error}</p>
        )}
        {/* Sculpt vs Turn camera — overlays the live preview */}
        <div className="absolute top-2 left-2 right-2 flex flex-col gap-1.5 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-white/20 bg-black/65 pointer-events-auto shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setViewDragMode('sculpt');
                  if (!blobBrush) setBlobBrush('add');
                  setShowAvatar(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                  viewDragMode === 'sculpt'
                    ? 'bg-fuchsia-500/40 text-fuchsia-50'
                    : 'text-white/55 hover:bg-white/10'
                }`}
                title="Drag to sculpt the mesh"
              >
                <Paintbrush className="w-3 h-3" />
                Sculpt
              </button>
              <button
                type="button"
                onClick={() => setViewDragMode('turn')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide border-l border-white/15 ${
                  viewDragMode === 'turn'
                    ? 'bg-sky-500/40 text-sky-50'
                    : 'text-white/55 hover:bg-white/10'
                }`}
                title="Drag to orbit · scroll / pinch to zoom · shift-drag to pan"
              >
                <Move3d className="w-3 h-3" />
                Turn
              </button>
            </div>
            <button
              type="button"
              onClick={() => setClayView((v) => !v)}
              className={`h-8 px-2 rounded-lg border text-[10px] font-bold uppercase pointer-events-auto flex items-center gap-1 ${
                clayView
                  ? 'border-amber-400/50 bg-amber-500/30 text-amber-50'
                  : 'border-white/20 bg-black/65 text-white/65 hover:bg-white/10'
              }`}
              title="Clay / matcap view — easier to read form while sculpting"
            >
              <Aperture className="w-3.5 h-3.5" />
              Clay
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !previewExpanded;
                setPreviewExpanded(next);
                if (next) {
                  setViewDragMode('sculpt');
                  if (!blobBrush) setBlobBrush('add');
                  setShowAvatar(false);
                  setClayView(true);
                }
              }}
              className={`h-8 px-2 rounded-lg border text-[10px] font-bold uppercase pointer-events-auto flex items-center gap-1 ${
                previewExpanded
                  ? 'border-cyan-400/50 bg-cyan-500/30 text-cyan-50'
                  : 'border-white/20 bg-black/65 text-white/65 hover:bg-white/10'
              }`}
              title={
                previewExpanded
                  ? 'Exit fullscreen sculpt'
                  : 'Fullscreen sculpt — great for tablets'
              }
            >
              {previewExpanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              {previewExpanded ? 'Exit' : 'Full'}
            </button>
            <button
              type="button"
              onClick={() => previewRef.current?.resetCamera()}
              className="ml-auto w-8 h-8 rounded-lg border border-white/20 bg-black/65 text-white/70 hover:bg-white/10 pointer-events-auto flex items-center justify-center"
              title="Reset camera"
              aria-label="Reset camera"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {!previewExpanded && (
            <div className="flex gap-1 pointer-events-auto">
              {(
                [
                  ['front', 'Front'],
                  ['side', 'Side'],
                  ['bottom', 'Bottom'],
                  ['top', 'Top'],
                  ['back', 'Back'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setViewDragMode('turn');
                    previewRef.current?.setCameraPreset(id);
                  }}
                  className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide border border-white/15 bg-black/55 text-white/60 hover:bg-white/10 hover:text-white/90"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen sculpt dock — brushes + size on tablet without leaving the canvas */}
        {previewExpanded && (
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-2 right-2 z-20 pointer-events-none">
            <div className="mx-auto max-w-lg rounded-2xl border border-white/15 bg-black/80 backdrop-blur-md p-2.5 space-y-2 pointer-events-auto shadow-2xl">
              <div className="flex gap-1.5">
                {(
                  [
                    ['add', 'Add', CirclePlus],
                    ['remove', 'Carve', CircleMinus],
                    ['smooth', 'Smooth', Waves],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setBlobBrush(id);
                      setViewDragMode('sculpt');
                      setShowAvatar(false);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-bold border ${
                      blobBrush === id && viewDragMode === 'sculpt'
                        ? 'bg-fuchsia-500/35 border-fuchsia-400/60 text-fuchsia-50'
                        : 'border-white/10 text-white/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    ['front', 'F'],
                    ['side', 'S'],
                    ['bottom', 'Bot'],
                    ['top', 'Top'],
                    ['back', 'B'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setViewDragMode('turn');
                      previewRef.current?.setCameraPreset(id);
                    }}
                    className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase border border-white/10 text-white/55"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[10px] text-white/50">
                <span className="w-10 shrink-0">Size</span>
                <input
                  type="range"
                  min={0.04}
                  max={0.35}
                  step={0.01}
                  value={brushRadius}
                  onChange={(e) => setBrushRadius(Number(e.target.value))}
                  className="flex-1 accent-fuchsia-400"
                />
              </label>
              <label className="flex items-center gap-2 text-[10px] text-white/50">
                <span className="w-10 shrink-0">Power</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={brushStrength}
                  onChange={(e) => setBrushStrength(Number(e.target.value))}
                  className="flex-1 accent-fuchsia-400"
                />
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setSymmetryX((v) => !v)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold border ${
                    symmetryX
                      ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                      : 'border-white/10 text-white/50'
                  }`}
                >
                  Sym {symmetryX ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={() => previewRef.current?.undoSculpt()}
                  className="flex-1 py-2 rounded-xl text-[10px] font-bold border border-white/10 text-white/60 disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={() => previewRef.current?.redoSculpt()}
                  className="flex-1 py-2 rounded-xl text-[10px] font-bold border border-white/10 text-white/60 disabled:opacity-40"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewExpanded(false)}
                  className="px-3 py-2 rounded-xl text-[10px] font-bold border border-cyan-400/40 bg-cyan-500/20 text-cyan-50"
                >
                  Done
                </button>
              </div>
              <p className="text-[9px] text-white/35 text-center">
                Pinch to zoom · one finger sculpt · Turn to orbit · safe for tablet detail work
              </p>
            </div>
          </div>
        )}

        {!previewExpanded && (
          <p className="absolute bottom-1.5 left-2 right-2 text-[9px] text-white/40 pointer-events-none truncate">
            {viewDragMode === 'turn'
              ? 'Turn: drag orbit · scroll/pinch zoom · shift-pan · Front/Bottom/Side for angles'
              : 'Sculpt: drag to add clay · pinch zoom · Full for tablet fullscreen'}
          </p>
        )}
      </div>

      {/* Clear body / skin-only toggle */}
      <div className="shrink-0 flex border-b border-white/10 bg-[#0e1520]">
        <button
          type="button"
          onClick={() => setShowAvatar(true)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-wide border-r border-white/10 ${
            showAvatar
              ? 'bg-sky-500/25 text-sky-100'
              : 'text-white/45 hover:bg-white/5'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          On body
        </button>
        <button
          type="button"
          onClick={() => setShowAvatar(false)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-wide ${
            !showAvatar
              ? 'bg-amber-500/25 text-amber-100'
              : 'text-white/45 hover:bg-white/5'
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          Skin only
        </button>
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
              const selected = slot === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ensureSlot(s.id)}
                  title={s.hint}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
                    selected
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
          {attachments.filter((a) => a.slot === 'addon').length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {attachments
                .filter((a) => a.slot === 'addon')
                .map((a, i) => (
                  <button
                    key={attachmentKey(a)}
                    type="button"
                    onClick={() => setActiveKey(attachmentKey(a))}
                    className={`px-2 py-0.5 rounded text-[9px] border ${
                      activeKey === attachmentKey(a)
                        ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
                        : 'border-white/10 text-white/45'
                    }`}
                  >
                    Custom {i + 1}
                  </button>
                ))}
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full mt-2"
            onClick={addCustomPart}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add custom body part
          </Button>
          <p className="text-[10px] text-white/35 mt-1 leading-snug">
            Tail, horn, or any custom piece — pick a body slot above, then use{' '}
            <b className="text-white/70">Place on player</b> (X/Y/Z) if it sits wrong. Same
            placement in gameplay.
          </p>
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
                  Use <span className="text-amber-200/80">Skin only</span> +{' '}
                  <span className="text-fuchsia-200/80">Sculpt</span> on the preview to paint.
                  Switch to <span className="text-sky-200/80">Turn</span> to orbit under the brim,
                  sides, etc.
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
                        setViewDragMode('sculpt');
                        setShowAvatar(false);
                        setSourceMode('sculpt');
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-bold border ${
                        blobBrush === id && viewDragMode === 'sculpt'
                          ? 'bg-fuchsia-500/30 border-fuchsia-400/60 text-fuchsia-50'
                          : 'border-white/10 text-white/55'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSymmetryX((v) => !v)}
                  className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold border ${
                    symmetryX
                      ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                      : 'border-white/10 text-white/50'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  Symmetry {symmetryX ? 'ON' : 'OFF'} (mirror L/R)
                </button>
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
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={!canUndo}
                    onClick={() => previewRef.current?.undoSculpt()}
                  >
                    <Undo2 className="w-3.5 h-3.5 mr-1" /> Undo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={!canRedo}
                    onClick={() => previewRef.current?.redoSculpt()}
                  >
                    <Redo2 className="w-3.5 h-3.5 mr-1" /> Redo
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={!activeAtt.sculpt}
                    onClick={() => {
                      patchActive({ sculpt: undefined });
                      previewRef.current?.clearSculptHistory();
                    }}
                  >
                    Reset clay
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setBlobBrush(null);
                      setViewDragMode('turn');
                    }}
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
          <p className="text-[10px] text-white/40">Feel — how it acts on the body</p>
          <div className="flex gap-1.5">
            {SKIN_MATERIAL_FEELS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => setFeel(f.id)}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border ${
                  (activeAtt.feel ?? slotMeta?.defaultFeel ?? 'solid') === f.id
                    ? f.id === 'solid'
                      ? 'bg-stone-500/30 border-stone-300/50 text-stone-100'
                      : f.id === 'cape'
                        ? 'bg-violet-500/30 border-violet-400/50 text-violet-100'
                        : 'bg-teal-500/30 border-teal-400/50 text-teal-100'
                    : 'border-white/10 text-white/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/35 leading-snug">
            {SKIN_MATERIAL_FEELS.find(
              (f) => f.id === (activeAtt.feel ?? slotMeta?.defaultFeel ?? 'solid')
            )?.hint}
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
            Upload a PNG/JPG for this part&apos;s surface, or use pattern colors above.
          </p>
        </div>

        {/* Place any selected part on the player (hat, face, torso, pants, boots, gloves, weapon, custom…) */}
        <div className="space-y-2 rounded-lg border border-amber-400/25 bg-amber-500/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider text-amber-200/90 font-bold">
              Place on player · {slotMeta?.label ?? slot}
            </p>
            {!showAvatar && (
              <button
                type="button"
                className="text-[9px] font-bold uppercase text-sky-300 hover:text-sky-100"
                onClick={() => setShowAvatar(true)}
              >
                Show on body
              </button>
            )}
          </div>
          <p className="text-[9px] text-white/40 leading-snug">
            Slide X / Y / Z to move this part if it sits wrong. Works for every body slot and custom
            addons — not only hats. Use <b className="text-white/70">On body</b> to preview.
          </p>
          <Vec3Sliders
            label="Position"
            value={activeAtt.position}
            onChange={(position) => {
              if (!showAvatar) setShowAvatar(true);
              patchActive({ position });
            }}
            mins={[-1.5, -0.25, -1.5]}
            maxs={[1.5, 2.2, 1.5]}
            step={0.01}
            resetTo={slotMeta?.defaultOffset ?? [0, 1, 0]}
            resetLabel="Reset to slot default"
          />
          <Vec3Sliders
            label="Rotation °"
            value={activeAtt.rotation}
            onChange={(rotation) => {
              if (!showAvatar) setShowAvatar(true);
              patchActive({ rotation });
            }}
            mins={[-180, -180, -180]}
            maxs={[180, 180, 180]}
            step={1}
            resetTo={[0, 0, 0]}
            resetLabel="Reset rotation"
          />
        </div>

        {/* Attach mode + pair mirror */}
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/45">Placement mode</p>
          <div className="flex gap-1.5">
            {(
              [
                ['body', 'Lock on body'],
                ['bone', 'Follow bone'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => patchActive({ attachMode: id })}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border ${
                  (activeAtt.attachMode ?? slotMeta?.defaultAttachMode ?? 'body') === id
                    ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                    : 'border-white/10 text-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/35 leading-snug">
            Lock on body = exact Offset you set here shows the same in play. Follow bone = sticks to
            head/hand when the avatar animates.
          </p>
          {slotMeta?.canPairMirror && (
            <button
              type="button"
              onClick={() => patchActive({ pairMirror: !activeAtt.pairMirror })}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold border ${
                activeAtt.pairMirror
                  ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
                  : 'border-white/10 text-white/50'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              Pair L/R {activeAtt.pairMirror ? 'ON' : 'OFF'} — edit one, mirror the other
            </button>
          )}
        </div>

        {slot === 'weapon' && (
          <WeaponCombatPanel
            combat={resolveWeaponCombat(activeAtt)}
            onChange={(weapon) => patchActive({ weapon })}
          />
        )}

        {/* Fit size — expand/shrink until it matches the body part */}
        <SizeFitControls
          scale={activeAtt.scale}
          onChange={(scale) => patchActive({ scale })}
          slotLabel={slotMeta?.label ?? slot}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              const reset = defaultAttachment(slot, activeAtt.id);
              patchActive(reset);
              setSourceMode('sculpt');
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset part
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={removeActive}
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
                const hat = defaultAttachment('hat');
                setAttachments([hat]);
                setActiveKey(attachmentKey(hat));
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

function WeaponCombatPanel({
  combat,
  onChange,
}: {
  combat: WeaponCombatConfig;
  onChange: (w: WeaponCombatConfig) => void;
}) {
  const patch = (partial: Partial<WeaponCombatConfig>) => onChange({ ...combat, ...partial });
  const setKind = (kind: WeaponCombatKind) => {
    onChange(defaultCombatForKind(kind));
  };
  const muzzle = combat.muzzleOffset ?? [0, 0.3, 0];

  return (
    <div className="space-y-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-orange-200/90 font-bold">
        Weapon combat
      </p>
      <p className="text-[10px] text-white/40 leading-snug">
        Mesh sits on the hand (Follow bone). Swing uses the character&apos;s Attack / Punch anim —
        not a separate animated weapon rig. Combat is a cone in front (same idea as trapper
        hitscan).
      </p>
      <div className="flex gap-1.5">
        {WEAPON_COMBAT_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            title={k.hint}
            onClick={() => setKind(k.id)}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border ${
              combat.kind === k.id
                ? 'bg-orange-500/30 border-orange-400/60 text-orange-50'
                : 'border-white/10 text-white/50'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      {combat.kind !== 'cosmetic' && (
        <>
          <p className="text-[9px] text-white/35 leading-snug">
            Range / cooldown drive Play Test swing reach. Damage numbers are stored for a later
            server combat pass (live match still uses room hitscan constants for trappers).
          </p>
          <SliderField
            label="Range"
            value={combat.range}
            min={0.8}
            max={18}
            step={0.2}
            onChange={(range) => patch({ range })}
          />
          <SliderField
            label="Damage (saved · server later)"
            value={combat.damage}
            min={5}
            max={100}
            step={5}
            onChange={(damage) => patch({ damage })}
          />
          <SliderField
            label="Cooldown ms"
            value={combat.cooldownMs}
            min={150}
            max={1200}
            step={20}
            onChange={(cooldownMs) => patch({ cooldownMs })}
          />
        </>
      )}
      <div className="flex gap-1.5">
        {(
          [
            ['attack', 'Attack anim'],
            ['punch', 'Punch anim'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => patch({ attackStyle: id })}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border ${
              (combat.attackStyle ?? 'attack') === id
                ? 'bg-sky-500/25 border-sky-400/50 text-sky-100'
                : 'border-white/10 text-white/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[9px] text-white/35">
        Tip / muzzle offset (for future VFX — grip stays at Offset above)
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <label key={axis} className="text-[9px] text-white/40">
            {axis}
            <input
              type="number"
              step={0.05}
              value={muzzle[i]}
              onChange={(e) => {
                const next = [...muzzle] as [number, number, number];
                next[i] = Number(e.target.value) || 0;
                patch({ muzzleOffset: next });
              }}
              className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px]"
            />
          </label>
        ))}
      </div>
      <p className="text-[9px] text-white/35 leading-snug">
        Bind Attack / Punch clips on the Player Model studio. Catalog: weapon-sword /
        weapon-shield, or upload a static GLB.
      </p>
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

function Vec3Sliders({
  label,
  value,
  onChange,
  mins,
  maxs,
  step,
  resetTo,
  resetLabel,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  mins: [number, number, number];
  maxs: [number, number, number];
  step: number;
  resetTo?: [number, number, number];
  resetLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => {
        const min = mins[i];
        const max = maxs[i];
        const clamped = Math.min(max, Math.max(min, value[i]));
        const outOfRange = value[i] < min - 1e-6 || value[i] > max + 1e-6;
        return (
          <label key={axis} className="flex items-center gap-2 text-[10px] text-white/50">
            <span className="w-4 shrink-0 font-bold text-white/70">{axis}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={clamped}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = Number(e.target.value);
                onChange(next);
              }}
              className="flex-1 accent-amber-400 h-2"
            />
            <input
              type="number"
              step={step}
              value={Number(value[i].toFixed(3))}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = Number(e.target.value) || 0;
                onChange(next);
              }}
              className={`w-14 shrink-0 rounded bg-black/40 border px-1 py-0.5 text-[10px] tabular-nums text-white text-right ${
                outOfRange ? 'border-amber-400/60' : 'border-white/10'
              }`}
            />
          </label>
        );
      })}
      {resetTo && (
        <button
          type="button"
          className="text-[9px] text-white/40 hover:text-amber-200"
          onClick={() => onChange([...resetTo] as [number, number, number])}
        >
          {resetLabel ?? 'Reset'}
        </button>
      )}
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
  private resizeObserver: ResizeObserver | null = null;
  private host: HTMLElement;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private painting = false;
  private viewDragMode: ViewDragMode = 'turn';
  private orbiting = false;
  private panning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private target = new THREE.Vector3(0, 1.1, 0);
  private spherical = { theta: 0.35, phi: 1.15, radius: 3.0 };
  private brush: {
    brush: SkinSculptBrush;
    radius: number;
    strength: number;
    symmetryX?: boolean;
  } | null = null;
  private onSculptCommit?: (data: { positions: number[]; count: number }) => void;
  private onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  private commitTimer: number | null = null;
  private undoStack: { positions: number[]; count: number }[] = [];
  private redoStack: { positions: number[]; count: number }[] = [];
  private strokeStartSnapshot: { positions: number[]; count: number } | null = null;
  private lastFramedKey: string | null = null;
  private clayView = false;
  private clayBackup = new Map<string, THREE.Material | THREE.Material[]>();
  private skinClock = 0;
  /** Active pointers for pinch-zoom (mobile). */
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartRadius = 3;

  constructor(
    host: HTMLElement,
    opts?: {
      onSculptCommit?: (data: { positions: number[]; count: number }) => void;
      onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
    }
  ) {
    this.host = host;
    this.onSculptCommit = opts?.onSculptCommit;
    this.onHistoryChange = opts?.onHistoryChange;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
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
    this.applyCameraFromSpherical();
    const resize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 208;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    resize();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(host);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);

    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      this.skinClock += 1 / 60;
      // No idle spin — spinning under the brush tore clay and left holes.
      if (this.avatar && this.showBody) {
        tickSkinAttachments(this.avatar, 1 / 60, this.skinClock);
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  setViewDragMode(mode: ViewDragMode) {
    this.viewDragMode = mode;
    this.painting = false;
    this.orbiting = false;
    this.panning = false;
    this.updateCursor();
  }

  setClayView(on: boolean) {
    this.clayView = on;
    this.applyClayMaterials();
  }

  private applyClayMaterials() {
    const roots: THREE.Object3D[] = [this.soloRoot];
    if (this.avatar) roots.push(this.avatar);

    if (!this.clayView) {
      // Restore
      for (const root of roots) {
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const id = mesh.uuid;
          const bak = this.clayBackup.get(id);
          if (bak) {
            mesh.material = bak;
            this.clayBackup.delete(id);
          }
        });
      }
      return;
    }

    const clay = new THREE.MeshNormalMaterial({ flatShading: false });
    for (const root of roots) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Only skin parts + solo — skip full avatar body when on body so clay reads the part
        const isSkin =
          root === this.soloRoot ||
          Boolean(mesh.parent?.name?.startsWith('skin_')) ||
          Boolean(mesh.name?.startsWith('prim_'));
        if (this.showBody && root === this.avatar && !isSkin) return;
        if (!this.clayBackup.has(mesh.uuid)) {
          this.clayBackup.set(mesh.uuid, mesh.material);
        }
        mesh.material = clay;
      });
    }
  }

  setCameraPreset(preset: 'front' | 'side' | 'bottom' | 'top' | 'back') {
    const radius = this.spherical.radius;
    switch (preset) {
      case 'front':
        this.spherical.theta = 0;
        this.spherical.phi = 1.15;
        break;
      case 'back':
        this.spherical.theta = Math.PI;
        this.spherical.phi = 1.15;
        break;
      case 'side':
        this.spherical.theta = Math.PI * 0.5;
        this.spherical.phi = 1.1;
        break;
      case 'bottom':
        this.spherical.theta = 0.2;
        this.spherical.phi = Math.PI - 0.25;
        break;
      case 'top':
        this.spherical.theta = 0.2;
        this.spherical.phi = 0.25;
        break;
    }
    this.spherical.radius = radius;
    this.applyCameraFromSpherical();
  }

  private updateCursor() {
    const el = this.renderer.domElement;
    if (this.viewDragMode === 'turn') {
      el.style.cursor = this.orbiting || this.panning ? 'grabbing' : 'grab';
    } else {
      el.style.cursor = this.brush ? 'crosshair' : 'default';
    }
  }

  setBlobBrush(
    cfg: {
      brush: SkinSculptBrush;
      radius: number;
      strength: number;
      symmetryX?: boolean;
    } | null
  ) {
    this.brush = cfg;
    this.updateCursor();
  }

  private emitHistory() {
    this.onHistoryChange?.(this.undoStack.length > 0, this.redoStack.length > 0);
  }

  clearSculptHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.emitHistory();
  }

  undoSculpt() {
    const mesh = findSculptMesh(this.soloRoot);
    if (!mesh || !this.undoStack.length) return;
    const current = readSculptData(mesh);
    if (current) this.redoStack.push(current);
    const prev = this.undoStack.pop()!;
    applySculptDataToGeometry(mesh.geometry as THREE.BufferGeometry, prev);
    this.onSculptCommit?.(prev);
    this.emitHistory();
  }

  redoSculpt() {
    const mesh = findSculptMesh(this.soloRoot);
    if (!mesh || !this.redoStack.length) return;
    const current = readSculptData(mesh);
    if (current) this.undoStack.push(current);
    const next = this.redoStack.pop()!;
    applySculptDataToGeometry(mesh.geometry as THREE.BufferGeometry, next);
    this.onSculptCommit?.(next);
    this.emitHistory();
  }

  private applyCameraFromSpherical() {
    const { theta, phi, radius } = this.spherical;
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      this.target.x + radius * sinPhi * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * sinPhi * Math.cos(theta)
    );
    this.camera.lookAt(this.target);
  }

  resetCamera() {
    if (this.showBody) {
      this.target.set(0, 1.1, 0);
      this.spherical = { theta: 0.35, phi: 1.15, radius: 3.0 };
    } else {
      this.frameSoloPart();
    }
    this.applyCameraFromSpherical();
  }

  forceResize() {
    const w = this.host.clientWidth || 320;
    const h = this.host.clientHeight || 208;
    if (w < 2 || h < 2) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private frameSoloPart() {
    this.soloRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.soloRoot);
    if (box.isEmpty()) {
      this.target.set(0, 0.15, 0);
      this.spherical = { theta: 0.4, phi: 1.1, radius: 1.35 };
      return;
    }
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    this.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.15);
    this.spherical = {
      theta: 0.45,
      phi: 1.05,
      radius: Math.max(0.55, maxDim * 2.35),
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    // Two-finger pinch zoom (mobile) — release capture so both fingers track.
    if (this.activePointers.size === 2) {
      this.painting = false;
      this.orbiting = false;
      this.panning = false;
      for (const id of this.activePointers.keys()) {
        try {
          this.renderer.domElement.releasePointerCapture?.(id);
        } catch {
          /* ignore */
        }
      }
      const pts = [...this.activePointers.values()];
      this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.pinchStartRadius = this.spherical.radius;
      this.updateCursor();
      return;
    }

    this.renderer.domElement.setPointerCapture?.(e.pointerId);

    if (this.viewDragMode === 'turn' || e.shiftKey || e.button === 1 || e.button === 2) {
      this.panning = e.shiftKey || e.button === 1;
      this.orbiting = !this.panning;
      this.updateCursor();
      return;
    }

    // Sculpt mode
    if (!this.brush) return;
    this.painting = true;
    const mesh = findSculptMesh(this.soloRoot);
    this.strokeStartSnapshot = mesh ? readSculptData(mesh) : null;
    this.paintAt(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch zoom while two fingers are down
    if (this.activePointers.size >= 2) {
      e.preventDefault();
      const pts = [...this.activePointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.pinchStartDist > 4) {
        const scale = this.pinchStartDist / Math.max(4, dist);
        this.spherical.radius = Math.min(
          12,
          Math.max(0.25, this.pinchStartRadius * scale)
        );
        this.applyCameraFromSpherical();
      }
      return;
    }

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (this.orbiting) {
      e.preventDefault();
      this.spherical.theta -= dx * 0.01;
      this.spherical.phi = Math.min(
        Math.PI - 0.08,
        Math.max(0.08, this.spherical.phi + dy * 0.01)
      );
      this.applyCameraFromSpherical();
      return;
    }

    if (this.panning) {
      e.preventDefault();
      const panScale = this.spherical.radius * 0.0018;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      this.target.addScaledVector(right, -dx * panScale);
      this.target.addScaledVector(up, dy * panScale);
      this.applyCameraFromSpherical();
      return;
    }

    if (!this.painting || !this.brush) return;
    e.preventDefault();
    this.paintAt(e.clientX, e.clientY);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.pinchStartDist = 0;
    }

    if (this.orbiting || this.panning) {
      this.orbiting = false;
      this.panning = false;
      this.updateCursor();
      try {
        this.renderer.domElement.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (!this.painting) {
      try {
        this.renderer.domElement.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    this.painting = false;
    try {
      this.renderer.domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.strokeStartSnapshot) {
      this.undoStack.push(this.strokeStartSnapshot);
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack = [];
      this.strokeStartSnapshot = null;
      this.emitHistory();
    }
    this.flushSculptCommit();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    this.spherical.radius = Math.min(12, Math.max(0.25, this.spherical.radius * factor));
    this.applyCameraFromSpherical();
  };

  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  private paintAt(clientX: number, clientY: number) {
    if (!this.brush) return;
    const mesh = findSculptMesh(this.soloRoot);
    if (!mesh) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
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
      symmetryX: Boolean(this.brush.symmetryX),
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
    const changed = this.showBody !== on;
    this.showBody = on;
    if (this.avatar) this.avatar.visible = on;
    this.soloRoot.visible = !on;
    if (this.avatar) this.avatar.rotation.y = 0;
    this.soloRoot.rotation.y = 0;
    if (changed) {
      if (!on) this.lastFramedKey = null; // force reframe solo
      this.resetCamera();
      this.applyClayMaterials();
    }
  }

  async setAttachments(atts: SkinAttachment[], focusKey?: string) {
    if (this.painting || this.orbiting || this.panning) return;
    // Clear clay backup before rebuild so we don't hold disposed mats
    this.clayBackup.clear();
    if (this.avatar) await applySkinAttachments(this.avatar, atts);
    while (this.soloRoot.children.length) this.soloRoot.remove(this.soloRoot.children[0]);
    const primary =
      (focusKey ? atts.find((a) => attachmentKey(a) === focusKey) : undefined) ?? atts[0];
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
        const key = attachmentKey(primary);
        const keyChanged = this.lastFramedKey !== key;
        if (!this.showBody && keyChanged) {
          this.frameSoloPart();
          this.applyCameraFromSpherical();
          this.lastFramedKey = key;
        }
      } catch (err) {
        console.warn('[SkinPreview solo]', err);
      }
    }
    if (this.clayView) this.applyClayMaterials();
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
