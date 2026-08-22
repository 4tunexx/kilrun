'use client';

import { PaintBucket, Palette, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextureAtlasPicker } from '../texture-atlas-picker';
import {
  BUILTIN_TEXTURES,
  deleteCustomTexture,
  listCustomTextures,
  saveCustomTexture,
} from '../texture-library';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';
import { persistEditorImageFile } from '@/lib/engine/platform-client';

function TexturesPanel({ brains }: { brains: MapEditorBrains }) {
  const {
    texFileRef,
    editTool,
    setEditTool,
    paintTextureUrl,
    setPaintTextureUrl,
    selected,
    env,
    apiRef,
    copiedTextureInfo,
    setCopiedTextureInfo,
    paintRepeat,
    setPaintRepeat,
    paintWorldScale,
    setPaintWorldScale,
    patchSelected,
    patchEnv,
    customTextures,
    setCustomTextures,
    toast,
  } = brains;

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-3">
      <Button size="sm" className="w-full" onClick={() => texFileRef.current?.click()}>
        <Upload className="w-4 h-4 mr-1" /> Upload texture
      </Button>
      <Button
        size="sm"
        variant={editTool === 'paint' ? 'default' : 'outline'}
        className={`w-full ${editTool === 'paint' ? 'bg-fuchsia-600 hover:bg-fuchsia-500' : ''}`}
        onClick={() => {
          const url =
            paintTextureUrl ||
            selected?.textureUrl ||
            env.defaultTextureUrl ||
            BUILTIN_TEXTURES[0]?.url ||
            null;
          setPaintTextureUrl(url);
          apiRef.current?.setPaintTexture(url);
          setEditTool('paint');
        }}
      >
        <PaintBucket className="w-4 h-4 mr-1" /> Paint brush (release to paint)
      </Button>
      <p className="text-[10px] text-white/45 leading-snug">
        Pick a texture, drag a region on the atlas editor (if an object is selected), then
        paint or apply. Atlas selection sets UV offset + tile for multi-tile sheets.
      </p>
      <div className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/5 px-2.5 py-2 space-y-1">
        <p className="text-[10px] text-fuchsia-100/90 leading-snug">
          <span className="font-semibold text-fuchsia-200">Copy a texture:</span> with the
          Paint tool active, <span className="font-semibold">right-click</span> any
          textured solid to copy its exact texture, tiling, offset, and rotation. Then{' '}
          <span className="font-semibold">left-click</span> another solid to paste it —
          aligned exactly like the source, seam-free.
        </p>
        {copiedTextureInfo && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-black/30 px-2 py-1">
            <span className="text-[10px] text-emerald-300 truncate">
              Copied{copiedTextureInfo.sourceName ? `: ${copiedTextureInfo.sourceName}` : ''} —
              ready to paste
            </span>
            <button
              type="button"
              className="text-[10px] text-white/50 hover:text-white/80 shrink-0"
              onClick={() => {
                apiRef.current?.clearCopiedTexture();
                setCopiedTextureInfo(null);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
      {(paintTextureUrl ||
        selected?.textureUrl ||
        env.defaultTextureUrl ||
        BUILTIN_TEXTURES[0]?.url) && (
        <TextureAtlasPicker
          imageUrl={
            paintTextureUrl ||
            selected?.textureUrl ||
            env.defaultTextureUrl ||
            BUILTIN_TEXTURES[0].url
          }
          repeat={selected?.textureRepeat ?? paintRepeat}
          offset={selected?.textureOffset}
          onChange={(uv) => {
            setPaintRepeat(uv.repeat);
            apiRef.current?.setPaintUv({
              worldScale: paintWorldScale,
              repeat: uv.repeat,
              offset: uv.offset,
            });
            if (selected) {
              patchSelected({
                textureUrl:
                  selected.textureUrl ||
                  paintTextureUrl ||
                  env.defaultTextureUrl ||
                  undefined,
                textureRepeat: uv.repeat,
                textureOffset: uv.offset,
                textureWorldScale: undefined,
              });
            }
          }}
        />
      )}
      <label className="block text-[10px] text-white/55">
        Texture scale — world units / tile ({paintWorldScale.toFixed(2)})
        <input
          type="range"
          min={0.25}
          max={16}
          step={0.25}
          className="w-full"
          value={paintWorldScale}
          onChange={(e) => {
            const n = Number(e.target.value);
            setPaintWorldScale(n);
            setPaintRepeat([n, n]);
            apiRef.current?.setPaintUv({ worldScale: n, repeat: [n, n] });
          }}
        />
      </label>
      <p className="text-[9px] text-white/40 leading-snug">
        Same scale tiles identically on every object size. Last scale is remembered for the
        next paint.
      </p>
      <input
        ref={texFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          void (async () => {
            try {
              const url = await persistEditorImageFile(f, 'misc');
              saveCustomTexture(f.name, url);
              setCustomTextures(listCustomTextures());
              setPaintTextureUrl(url);
              apiRef.current?.setPaintTexture(url);
              setEditTool('paint');
            } catch (err) {
              toast({
                title: 'Texture upload failed',
                description: err instanceof Error ? err.message : 'Link live game, then try again.',
                variant: 'destructive',
              });
            }
          })();
        }}
      />
      <p className="text-[10px] text-white/40">Built-in</p>
      <div className="grid grid-cols-2 gap-2">
        {BUILTIN_TEXTURES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded border p-1 hover:border-cyan-400 ${
              paintTextureUrl === t.url && editTool === 'paint'
                ? 'border-fuchsia-400'
                : 'border-white/10'
            }`}
            onClick={() => {
              setPaintTextureUrl(t.url);
              apiRef.current?.setPaintTexture(t.url);
              apiRef.current?.clearCopiedTexture();
              setCopiedTextureInfo(null);
              setEditTool('paint');
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (selected) patchSelected({ textureUrl: t.url });
              else patchEnv({ defaultTextureUrl: t.url });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.url} alt={t.name} className="w-full aspect-square object-cover rounded" />
            <p className="text-[10px] mt-1 truncate">{t.name}</p>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-white/40">Uploaded</p>
      <div className="grid grid-cols-2 gap-2">
        {customTextures.map((t) => (
          <div key={t.id} className="rounded border border-white/10 p-1 relative">
            <button
              type="button"
              className="w-full"
              onClick={() => {
                setPaintTextureUrl(t.dataUrl);
                apiRef.current?.setPaintTexture(t.dataUrl);
                apiRef.current?.clearCopiedTexture();
                setCopiedTextureInfo(null);
                setEditTool('paint');
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.dataUrl} alt={t.name} className="w-full aspect-square object-cover rounded" />
              <p className="text-[10px] mt-1 truncate">{t.name}</p>
            </button>
            <button
              type="button"
              className="absolute top-1 right-1 w-5 h-5 rounded bg-black/70 text-red-300 text-xs"
              onClick={() => {
                deleteCustomTexture(t.id);
                setCustomTextures(listCustomTextures());
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/40">
        Left-click texture = paint brush (release on model). Right-click = apply to selection /
        world default.
      </p>
    </div>
  );
}

export const texturesPlugin: MapEditorPlugin = {
  id: 'textures',
  slot: 'sidebar',
  label: 'Textures',
  icon: Palette,
  order: 60,
  render: (brains) => <TexturesPanel brains={brains} />,
};
