'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  characterAssetModelUrl,
  listCharacterAssets,
  EDITOR_CHARACTER_CATEGORIES,
  type AssetCategory,
  type AssetRegistryEntry,
} from '@/lib/asset-registry';

type Props = {
  /** Categories to show (default: editor set). */
  categories?: AssetCategory[];
  valueUrl?: string | null;
  onPick: (entry: AssetRegistryEntry, modelUrl: string) => void;
  className?: string;
  label?: string;
};

/**
 * Shared picker so Map / Player / Model editors all see the seeded character pack.
 */
export function CharacterAssetPicker({
  categories = EDITOR_CHARACTER_CATEGORIES,
  valueUrl,
  onPick,
  className,
  label = 'Character pack',
}: Props) {
  const [assets, setAssets] = useState<AssetRegistryEntry[]>([]);
  const [category, setCategory] = useState<AssetCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listCharacterAssets({ category: categories }).then((list) => {
      if (cancelled) return;
      setAssets(list);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const filtered = useMemo(() => {
    let list = assets;
    if (category !== 'all') list = list.filter((a) => a.category === category);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (a) =>
          a.displayName.toLowerCase().includes(needle) ||
          a.id.toLowerCase().includes(needle) ||
          a.name.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [assets, category, q]);

  const cats = useMemo(() => ['all' as const, ...categories], [categories]);

  return (
    <div className={className ?? 'space-y-1.5'}>
      <p className="text-[10px] tracking-widest text-white/50 uppercase">{label}</p>
      {!loaded ? (
        <p className="text-[11px] text-white/40">Loading pack…</p>
      ) : assets.length === 0 ? (
        <p className="text-[11px] text-amber-200/80">
          No character assets yet. Run{' '}
          <code className="text-white/70">npx tsx scripts/seed-asset-registry.ts</code>
        </p>
      ) : (
        <>
          <div className="flex gap-1.5">
            <select
              className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs"
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory | 'all')}
            >
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? `All (${assets.length})` : c}
                </option>
              ))}
            </select>
            <input
              className="w-[40%] bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
            value={valueUrl ?? ''}
            onChange={(e) => {
              const url = e.target.value;
              if (!url) return;
              const entry = assets.find((a) => characterAssetModelUrl(a) === url);
              if (entry) onPick(entry, url);
            }}
          >
            <option value="">— pick character model —</option>
            {filtered.map((a) => {
              const url = characterAssetModelUrl(a);
              return (
                <option key={a.id} value={url}>
                  [{a.category}] {a.displayName}
                </option>
              );
            })}
          </select>
          <p className="text-[10px] text-white/35">{filtered.length} models</p>
        </>
      )}
    </div>
  );
}
