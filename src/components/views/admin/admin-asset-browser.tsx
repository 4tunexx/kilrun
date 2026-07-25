'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, ImagePlus, Loader2, Package, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  adminBulkUpdateAssets,
  adminDeleteAsset,
  adminListAssets,
  adminSetAssetThumbnail,
  adminUploadAsset,
} from '@/lib/asset-admin-actions';
import { loadAnimatedPrefab } from '@/components/game/editor/model-scan';
import { captureModelThumbnail, createThumbnailCaptureSession } from '@/components/game/editor/thumbnail-capture';
import {
  EDITOR_CHARACTER_CATEGORIES,
  loadCharacterAssetManifest,
  type AssetRegistryEntry,
} from '@/lib/asset-registry';
import { packBodyThumbnailPath, parsePackBodyName } from '@/lib/pack-body-colors';
import { cn } from '@/lib/utils';

type AssetRow = Awaited<ReturnType<typeof adminListAssets>>['items'][number];

type GridAsset = {
  assetId: string;
  displayName: string;
  category: string;
  rarity: string;
  price: number;
  currency: string;
  modelPath: string;
  texturePath: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  enabled: boolean;
  shopVisible: boolean;
  featured: boolean;
  hidden: boolean;
  equipSlot: string;
  fromDb: boolean;
};

function toGridFromDb(row: AssetRow): GridAsset {
  return {
    assetId: row.assetId,
    displayName: row.displayName,
    category: row.category,
    rarity: row.rarity,
    price: row.price,
    currency: row.currency,
    modelPath: row.modelPath,
    texturePath: row.texturePath,
    thumbnailUrl: row.thumbnailUrl,
    previewUrl: row.previewUrl,
    enabled: row.enabled,
    shopVisible: row.shopVisible,
    featured: row.featured,
    hidden: row.hidden,
    equipSlot: row.equipSlot,
    fromDb: true,
  };
}

function toGridFromManifest(entry: AssetRegistryEntry): GridAsset {
  return {
    assetId: entry.id,
    displayName: entry.displayName,
    category: entry.category,
    rarity: entry.rarity,
    price: entry.price,
    currency: entry.currency,
    modelPath: entry.modelPath,
    texturePath: entry.texturePath,
    thumbnailUrl: entry.thumbnailPath,
    previewUrl: entry.previewPath,
    enabled: entry.enabled,
    shopVisible: entry.shopVisible,
    featured: entry.featured,
    hidden: entry.hidden,
    equipSlot: entry.equipSlot,
    fromDb: false,
  };
}

function thumbSrc(asset: GridAsset): string | null {
  // A real thumbnail (ideally a rendered 3D icon — see "Regenerate 3D
  // thumbnail") always wins. Only fall back to the raw shared texture atlas
  // (Body_XXX.png) for pack body-color variants that never got one.
  const explicit = asset.thumbnailUrl?.trim();
  if (explicit) return explicit;
  const fromName = packBodyThumbnailPath(asset.assetId) || packBodyThumbnailPath(asset.displayName);
  if (fromName) return fromName;
  return asset.previewUrl?.trim() || asset.texturePath?.trim() || null;
}

const CATEGORY_TINT: Record<string, string> = {
  fullbody: 'from-violet-700/80 to-fuchsia-900/60',
  body: 'from-rose-700/80 to-orange-900/60',
  hat: 'from-amber-600/80 to-yellow-900/50',
  hair: 'from-pink-600/70 to-rose-900/50',
  glasses: 'from-cyan-600/70 to-slate-900/50',
  glove: 'from-emerald-600/70 to-teal-900/50',
  backpack: 'from-blue-600/70 to-indigo-900/50',
  mustache: 'from-stone-500/80 to-stone-900/50',
  outerwear: 'from-sky-600/70 to-slate-900/50',
  pants: 'from-lime-700/70 to-green-950/50',
  shoe: 'from-orange-600/70 to-amber-950/50',
  eyebrow: 'from-neutral-500/70 to-neutral-900/50',
};

function PreviewCanvas({ modelPath }: { modelPath: string | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !modelPath) return;

    let disposed = false;
    setStatus('loading');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12121a);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
    camera.position.set(1.6, 1.4, 2.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.9, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.15);
    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(3, 6, 2);
    scene.add(hemi, dir);
    const grid = new THREE.GridHelper(4, 8, 0x334155, 0x1e293b);
    scene.add(grid);

    let mixer: THREE.AnimationMixer | null = null;
    let raf = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 280;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    void loadAnimatedPrefab(modelPath)
      .then(({ root, clips }) => {
        if (disposed) return;
        scene.add(root);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const center = box.getCenter(new THREE.Vector3());
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(size * 0.7, size * 0.45, size * 0.9));
        if (clips[0]) {
          mixer = new THREE.AnimationMixer(root);
          mixer.clipAction(clips[0]).play();
        }
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('[asset preview]', err);
        if (!disposed) setStatus('error');
      });

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = clock.getDelta();
      if (playing) mixer?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [modelPath, playing]);

  return (
    <div className="space-y-2">
      <div
        ref={hostRef}
        className="relative h-64 w-full overflow-hidden rounded-lg border border-white/10 bg-black/50"
      >
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-slate-300 text-xs gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading 3D…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-rose-300 text-xs px-4 text-center">
            Could not load model (FBX). Check path / console.
          </div>
        )}
      </div>
      <Button size="sm" variant="secondary" onClick={() => setPlaying((p) => !p)}>
        {playing ? 'Pause anim' : 'Play anim'}
      </Button>
    </div>
  );
}

function AssetThumb({ asset }: { asset: GridAsset }) {
  const src = thumbSrc(asset);
  const tint = CATEGORY_TINT[asset.category] ?? 'from-slate-700 to-slate-900';
  const [broken, setBroken] = useState(false);

  // Body color name → distinct fallback (not all red)
  const bodyTint = (() => {
    const parsed = parsePackBodyName(asset.assetId) || parsePackBodyName(asset.displayName);
    if (!parsed) return null;
    const map: Record<string, string> = {
      blue: 'from-blue-600 to-blue-950',
      brown: 'from-amber-800 to-stone-950',
      orange: 'from-orange-500 to-orange-950',
      red: 'from-rose-600 to-rose-950',
      white: 'from-slate-200 to-slate-500 text-slate-900',
      yellow: 'from-yellow-400 to-amber-800',
    };
    return map[parsed.color] ?? null;
  })();

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={asset.displayName}
        className="h-full w-full object-contain p-2 bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_70%)]"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br text-white/80',
        bodyTint ?? tint
      )}
    >
      {asset.category === 'fullbody' || asset.category === 'body' ? (
        <Box className="h-8 w-8 opacity-80" />
      ) : (
        <Package className="h-8 w-8 opacity-80" />
      )}
      <span className="text-[10px] uppercase tracking-wider opacity-70">{asset.category}</span>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AdminAssetBrowser() {
  const { toast } = useToast();
  const [items, setItems] = useState<GridAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<'db' | 'manifest'>('db');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GridAsset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenAll, setRegenAll] = useState<{ done: number; total: number } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminListAssets({
        q: q || undefined,
        category: category === 'all' ? undefined : category,
        take: 500,
      });
      if (res.items.length > 0) {
        setItems(res.items.map(toGridFromDb));
        setTotal(res.total);
        setSource('db');
        return;
      }
      // DB empty → show seeded public manifest so admins still see every skin
      const man = await loadCharacterAssetManifest(true);
      let list = (man?.assets ?? []).map(toGridFromManifest);
      if (category !== 'all') list = list.filter((a) => a.category === category);
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        list = list.filter(
          (a) =>
            a.displayName.toLowerCase().includes(needle) ||
            a.assetId.toLowerCase().includes(needle)
        );
      }
      setItems(list);
      setTotal(list.length);
      setSource('manifest');
      if (list.length === 0) {
        toast({
          title: 'No assets found',
          description: 'Run: npx tsx scripts/seed-asset-registry.ts',
          variant: 'destructive',
        });
      }
    } catch (e) {
      // Admin DB query failed — still try manifest
      try {
        const man = await loadCharacterAssetManifest(true);
        let list = (man?.assets ?? []).map(toGridFromManifest);
        if (category !== 'all') list = list.filter((a) => a.category === category);
        setItems(list);
        setTotal(list.length);
        setSource('manifest');
      } catch {
        toast({
          title: e instanceof Error ? e.message : 'Failed to load assets',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [q, category, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUploadFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.(glb|gltf|fbx)$/i.test(file.name)) {
      toast({ title: 'Pick a GLB / GLTF / FBX model file', variant: 'destructive' });
      return;
    }
    if (file.size > 45_000_000) {
      toast({ title: 'Model too large (max ~45 MB)', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await adminUploadAsset({ fileName: file.name, modelDataUrl: dataUrl });
      toast({
        title: 'Skin uploaded',
        description: `${res.assetId} added (inactive). Click it, then Activate.`,
      });
      await refresh();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Upload failed',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  /** Render a fresh transparent-bg PNG from the asset's real 3D model and save it. */
  const regenerateThumbnail = async (asset: GridAsset) => {
    setRegenerating(true);
    try {
      const dataUrl = await captureModelThumbnail(asset.modelPath);
      const res = await adminSetAssetThumbnail(asset.assetId, dataUrl);
      setItems((prev) =>
        prev.map((a) =>
          a.assetId === asset.assetId ? { ...a, thumbnailUrl: res.thumbnailUrl } : a
        )
      );
      setSelected((prev) =>
        prev && prev.assetId === asset.assetId ? { ...prev, thumbnailUrl: res.thumbnailUrl } : prev
      );
      toast({ title: `Thumbnail updated — ${asset.displayName}` });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to render thumbnail',
        variant: 'destructive',
      });
    } finally {
      setRegenerating(false);
    }
  };

  /** Bulk-replace thumbnails for a specific list of assets, fast: one shared
   * WebGL context for the whole batch (instead of one per item), and up to
   * 4 uploads in flight at once instead of waiting on each round-trip. */
  const regenerateThumbnailsFor = async (targets: GridAsset[]) => {
    const withModel = targets.filter((a) => a.modelPath);
    if (withModel.length === 0) return;
    setRegenAll({ done: 0, total: withModel.length });

    const session = createThumbnailCaptureSession();
    const UPLOAD_CONCURRENCY = 4;
    let inFlight = 0;
    let done = 0;
    let failed = 0;
    const pending: Promise<void>[] = [];

    const upload = async (asset: GridAsset, dataUrl: string) => {
      inFlight++;
      try {
        await adminSetAssetThumbnail(asset.assetId, dataUrl);
      } catch (e) {
        failed++;
        console.warn('[thumbnail regen upload]', asset.assetId, e);
      } finally {
        inFlight--;
        done++;
        setRegenAll({ done, total: withModel.length });
      }
    };

    for (const asset of withModel) {
      let dataUrl: string | null = null;
      try {
        dataUrl = await session.capture(asset.modelPath);
      } catch (e) {
        failed++;
        done++;
        setRegenAll({ done, total: withModel.length });
        console.warn('[thumbnail regen capture]', asset.assetId, e);
      }
      if (dataUrl) {
        pending.push(upload(asset, dataUrl));
      }
      while (inFlight >= UPLOAD_CONCURRENCY) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    await Promise.all(pending);
    session.dispose();

    toast({
      title: 'Thumbnail regeneration finished',
      description: failed
        ? `${withModel.length - failed}/${withModel.length} updated, ${failed} failed (bad/missing model).`
        : `${withModel.length} skin thumbnail${withModel.length === 1 ? '' : 's'} replaced with 3D renders.`,
      variant: failed ? 'destructive' : undefined,
    });
    setRegenAll(null);
    await refresh();
  };

  /** Bulk-replace every listed skin's thumbnail with a live 3D render. */
  const regenerateAllThumbnails = async () => {
    if (source !== 'db' || items.length === 0) return;
    await regenerateThumbnailsFor(items);
  };

  /** Bulk-replace only the checked skins' thumbnails. */
  const regenerateSelectedThumbnails = async () => {
    if (source !== 'db' || selectedIds.size === 0) return;
    const targets = items.filter((a) => selectedIds.has(a.assetId));
    await regenerateThumbnailsFor(targets);
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllShown = () => setSelectedIds(new Set(items.map((a) => a.assetId)));
  const clearSelection = () => setSelectedIds(new Set());

  const runBulk = async (changes: Parameters<typeof adminBulkUpdateAssets>[1]) => {
    if (!selectedIds.size || source !== 'db') return;
    setBusy(true);
    try {
      await adminBulkUpdateAssets(Array.from(selectedIds), changes);
      toast({ title: `Updated ${selectedIds.size} assets` });
      await refresh();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Bulk update failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const categories = useMemo(() => ['all', ...EDITOR_CHARACTER_CATEGORIES], []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <p className="text-xs text-muted-foreground mb-1">Search</p>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alien, Hat_012…" />
        </div>
        <div className="w-44">
          <p className="text-xs text-muted-foreground mb-1">Category</p>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
        <input
          ref={uploadInputRef}
          type="file"
          accept=".glb,.gltf,.fbx"
          className="hidden"
          onChange={(e) => void onUploadFile(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="secondary"
          disabled={uploading || source !== 'db'}
          onClick={() => uploadInputRef.current?.click()}
          title={source !== 'db' ? 'Needs DB (run seed with DATABASE_URL)' : 'Upload GLB / FBX skin'}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Upload className="h-4 w-4 mr-1.5" /> Upload skin
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          disabled={!!regenAll || source !== 'db' || items.length === 0}
          onClick={() => void regenerateAllThumbnails()}
          title="Re-render every listed skin's shop/admin thumbnail from its real 3D model, transparent background"
        >
          {regenAll ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Rendering {regenAll.done}/{regenAll.total}…
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4 mr-1.5" /> Regenerate all thumbnails (3D)
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {loading ? 'Loading…' : `${items.length} shown${source === 'db' ? ` / ${total} in DB` : ''}`}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {source === 'db' ? 'Database' : 'Manifest (seed files)'}
        </Badge>
        {source === 'manifest' && (
          <span className="text-amber-300/90">
            Publish / enable needs DB — run seed script with DATABASE_URL.
          </span>
        )}
        {regenAll && (
          <span className="text-cyan-300/90">
            Rendering transparent 3D icons — don&apos;t close this tab…
          </span>
        )}
      </div>

      {source === 'db' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={selectAllShown} disabled={!items.length}>
            Select all ({items.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={!selectedIds.size}>
            Clear
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !selectedIds.size} onClick={() => void runBulk({ enabled: true })}>
            Enable
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !selectedIds.size} onClick={() => void runBulk({ enabled: false })}>
            Disable
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !selectedIds.size} onClick={() => void runBulk({ featured: true })}>
            Feature
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!!regenAll || !selectedIds.size}
            onClick={() => void regenerateSelectedThumbnails()}
            title="Re-render only the checked skins' thumbnails from their 3D models"
          >
            {regenAll ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Rendering {regenAll.done}/{regenAll.total}…
              </>
            ) : (
              <>
                <ImagePlus className="h-3.5 w-3.5 mr-1" /> Regenerate thumbnails ({selectedIds.size} selected)
              </>
            )}
          </Button>
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_340px] gap-4">
        <div className="max-h-[640px] overflow-auto rounded-lg border border-border/60 bg-slate-950/40 p-3">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading skins…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm space-y-2">
              <p>No skins found.</p>
              <p className="text-xs">
                Run <code className="text-slate-300">npm run db:seed-assets</code> then refresh.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((asset) => {
                const active = selected?.assetId === asset.assetId;
                return (
                  <button
                    key={asset.assetId}
                    type="button"
                    onClick={() => setSelected(asset)}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all',
                      active
                        ? 'border-cyan-400/80 ring-2 ring-cyan-400/40 bg-slate-800/80'
                        : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-500 hover:-translate-y-0.5'
                    )}
                  >
                    {source === 'db' && (
                      <span
                        className="absolute left-1.5 top-1.5 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={selectedIds.has(asset.assetId)}
                          onChange={() => toggleId(asset.assetId)}
                        />
                      </span>
                    )}
                    <div className="aspect-square w-full overflow-hidden border-b border-white/5">
                      <AssetThumb asset={asset} />
                    </div>
                    <div className="p-2 space-y-1 min-w-0">
                      <p className="text-xs font-semibold truncate" title={asset.displayName}>
                        {asset.displayName}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 capitalize">
                          {asset.category}
                        </Badge>
                        {asset.shopVisible && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-emerald-700">Shop</Badge>
                        )}
                        {asset.featured && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-amber-600">Feat</Badge>
                        )}
                        {!asset.enabled && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            Off
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3 bg-slate-900/40 h-fit sticky top-0">
          <p className="text-sm font-medium">3D Preview</p>
          {selected ? (
            <>
              <div className="aspect-square w-full overflow-hidden rounded-md border border-white/10">
                <AssetThumb asset={selected} />
              </div>
              <PreviewCanvas modelPath={selected.modelPath} />
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground">{selected.displayName}</div>
                <div className="capitalize">
                  {selected.category} · {selected.rarity} · {selected.price} {selected.currency}
                </div>
                <div>Slot: {selected.equipSlot}</div>
                <div className="break-all opacity-70">{selected.modelPath}</div>
              </div>
              {source === 'db' && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={selected.enabled ? 'secondary' : 'default'}
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          try {
                            await adminBulkUpdateAssets([selected.assetId], {
                              enabled: !selected.enabled,
                            });
                            toast({
                              title: selected.enabled ? 'Asset deactivated' : 'Asset activated',
                              description: selected.enabled
                                ? 'Hidden from editors and Cosmetics Studio.'
                                : 'Now available in Cosmetics Studio → Skins for shop listing.',
                            });
                            await refresh();
                          } catch (e) {
                            toast({
                              title: e instanceof Error ? e.message : 'Failed',
                              variant: 'destructive',
                            });
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      {selected.enabled ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={regenerating || !!regenAll}
                      onClick={() => void regenerateThumbnail(selected)}
                      title="Re-render this thumbnail from the actual 3D model, transparent background"
                    >
                      {regenerating ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5 mr-1" />
                      )}
                      Regenerate 3D thumbnail
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          if (!confirm(`Delete asset “${selected.displayName}” from the registry?`)) return;
                          setBusy(true);
                          try {
                            await adminDeleteAsset(selected.assetId);
                            toast({ title: 'Asset deleted' });
                            setSelected(null);
                            await refresh();
                          } catch (e) {
                            toast({
                              title: e instanceof Error ? e.message : 'Failed',
                              variant: 'destructive',
                            });
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Shop listing (price, event / mission unlock, dashboard promo) moved to{' '}
                    <span className="text-slate-300">Shop → Cosmetics Studio → Skins</span>. Only
                    activated assets show up there.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">
              Click a skin card to preview texture + 3D model.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
