'use client';

/**
 * Map Editor → Buy Menu — Horde / Competitive weapons + power-ups + economy.
 */

import React, { useRef } from 'react';
import {
  ShoppingCart,
  RotateCcw,
  Save,
  Crosshair,
  Sword,
  Upload,
  Download,
  Plus,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  MapDocument,
  MapShopItem,
  MapShopPowerUp,
  MapShopSettings,
  MapShopSkin,
} from './map-document';
import {
  defaultShopItems,
  defaultShopPowerUps,
  defaultShopSkins,
  ensureShopSettings,
  sanitizeShopItem,
  sanitizeShopPowerUp,
  sanitizeShopSkin,
} from './map-document';
import { CATALOG_WEAPONS } from '@/lib/weapon-catalog';

const QUICK_PRESETS = [
  { id: 'pistol_001', label: 'Pistol' },
  { id: 'rifle_001', label: 'SMG / Rifle' },
  { id: 'shotgun_001', label: 'Shotgun' },
  { id: 'sniper_rifle_001', label: 'Sniper' },
  { id: 'axe_001', label: 'Axe' },
  { id: 'baseball_bat_001', label: 'Bat' },
  { id: 'hockey_stick_001', label: 'Hockey Stick' },
  { id: 'knife_001', label: 'Knife' },
] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
}

export function MapShopPanel({
  mapDoc,
  onSave,
  onClose,
}: {
  mapDoc: MapDocument;
  onSave: (settings: MapShopSettings) => void;
  onClose: () => void;
}) {
  const [settings, setSettings] = React.useState<MapShopSettings>(() =>
    ensureShopSettings(mapDoc)
  );
  const [dirty, setDirty] = React.useState(false);
  const [section, setSection] = React.useState<
    'weapons' | 'skins' | 'powerups' | 'economy'
  >('weapons');
  const texRef = useRef<HTMLInputElement>(null);
  /** 'item:<id>' | 'skin:<id>' | 'skin-new' */
  const texTargetKey = useRef<string | null>(null);

  React.useEffect(() => {
    setSettings(ensureShopSettings(mapDoc));
    setDirty(false);
    // Deliberately only these 3 fields, not the whole mapDoc object — mapDoc
    // gets a new reference on every unrelated edit elsewhere in the map
    // editor, and re-syncing on every one of those would wipe out unsaved
    // local shop-panel edits. Same pattern used throughout map-editor.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapDoc.name, mapDoc.shopSettings, mapDoc.weaponDef]);

  const patchItem = (id: string, partial: Partial<MapShopItem>) => {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...partial } : it)),
    }));
    setDirty(true);
  };

  const patchPower = (id: string, partial: Partial<MapShopPowerUp>) => {
    setSettings((prev) => ({
      ...prev,
      powerUps: (prev.powerUps ?? []).map((p) => (p.id === id ? { ...p, ...partial } : p)),
    }));
    setDirty(true);
  };

  const patchSkin = (id: string, partial: Partial<MapShopSkin>) => {
    setSettings((prev) => ({
      ...prev,
      skins: (prev.skins ?? []).map((s) => (s.id === id ? { ...s, ...partial } : s)),
    }));
    setDirty(true);
  };

  const toggleMode = (id: string, mode: 'horde' | 'competitive') => {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== id) return it;
        const has = it.modes.includes(mode);
        const modes = has ? it.modes.filter((m) => m !== mode) : [...it.modes, mode];
        return {
          ...it,
          modes: modes.length ? modes : (['horde'] as Array<'horde' | 'competitive'>),
        };
      }),
    }));
    setDirty(true);
  };

  const toggleSkinMode = (id: string, mode: 'horde' | 'competitive') => {
    setSettings((prev) => ({
      ...prev,
      skins: (prev.skins ?? []).map((s) => {
        if (s.id !== id) return s;
        const has = s.modes.includes(mode);
        const modes = has ? s.modes.filter((m) => m !== mode) : [...s.modes, mode];
        return {
          ...s,
          modes: modes.length ? modes : (['horde'] as Array<'horde' | 'competitive'>),
        };
      }),
    }));
    setDirty(true);
  };

  const resetDefaults = () => {
    setSettings({
      items: defaultShopItems(),
      powerUps: defaultShopPowerUps(),
      skins: defaultShopSkins(),
      startingCredits: 500,
      creditsPerKill: 50,
      creditsPerWaveClear: 100,
    });
    setDirty(true);
  };

  const addFromCatalog = (catalogId: string) => {
    const cat = CATALOG_WEAPONS.find((w) => w.id === catalogId);
    if (!cat) return;
    if (settings.items.some((it) => it.id === cat.id || it.catalogId === cat.id)) {
      // Already there — just enable it
      setSettings((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === cat.id || it.catalogId === cat.id ? { ...it, enabled: true } : it
        ),
      }));
      setDirty(true);
      return;
    }
    const item = sanitizeShopItem(
      {
        id: cat.id,
        label: cat.label,
        kind: cat.kind === 'melee' ? 'melee' : 'hitscan',
        damage: cat.combat.damage,
        range: cat.combat.range,
        cooldownMs: cat.combat.cooldownMs,
        coneRadians: cat.combat.coneRadians,
        fireMode: cat.combat.fireMode,
        pellets: cat.combat.pellets,
        adsZoomFov: cat.combat.adsZoomFov,
        adsConeScale: cat.combat.adsConeScale,
        hipfireConeScale: cat.combat.hipfireConeScale,
        magSize: cat.combat.magSize,
        reserveAmmo: cat.combat.reserveAmmo,
        reloadMs: cat.combat.reloadMs,
        shopPrice: cat.kind === 'hitscan' ? 200 : 100,
        modelUrl: cat.modelUrl,
        catalogId: cat.id,
        enabled: true,
        modes: [...cat.modes],
        sortOrder: settings.items.length,
      },
      settings.items.length
    );
    if (!item) return;
    setSettings((prev) => ({ ...prev, items: [...prev.items, item] }));
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id),
    }));
    setDirty(true);
  };

  const addSkin = (textureUrl: string) => {
    const id = `skin_${Date.now().toString(36)}`;
    const skin = sanitizeShopSkin(
      {
        id,
        label: `Skin ${(settings.skins?.length ?? 0) + 1}`,
                description: 'Weapon skin',
        shopPrice: 150,
        textureUrl,
        enabled: true,
        modes: ['horde', 'competitive'],
        sortOrder: settings.skins?.length ?? 0,
      },
      settings.skins?.length ?? 0
    );
    if (!skin) return;
    setSettings((prev) => ({
      ...prev,
      skins: [...(prev.skins ?? []), skin],
    }));
    setDirty(true);
  };

  const removeSkin = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      skins: (prev.skins ?? []).filter((s) => s.id !== id),
    }));
    setDirty(true);
  };

  const save = () => {
    onSave({
      startingCredits: Math.max(0, Math.floor(settings.startingCredits) || 0),
      creditsPerKill: Math.max(0, Math.floor(settings.creditsPerKill) || 0),
      creditsPerWaveClear: Math.max(0, Math.floor(settings.creditsPerWaveClear) || 0),
      items: settings.items
        .map((it, i) => sanitizeShopItem(it, i))
        .filter((it): it is MapShopItem => !!it),
      powerUps: (settings.powerUps ?? [])
        .map(sanitizeShopPowerUp)
        .filter((p): p is MapShopPowerUp => !!p),
      skins: (settings.skins ?? [])
        .map((s, i) => sanitizeShopSkin(s, i))
        .filter((s): s is MapShopSkin => !!s),
    });
    setDirty(false);
  };

  const powerUps = settings.powerUps ?? defaultShopPowerUps();
  const skins = settings.skins ?? defaultShopSkins();

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-[#0c121a] text-white">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 bg-[#121a24] shrink-0">
        <ShoppingCart className="w-4 h-4 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide uppercase text-amber-200">Buy Menu</p>
          <p className="text-[10px] text-white/45 truncate">Weapons · skins · power-ups · credits</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-[10px] text-white/50 hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="flex gap-1 px-2 py-1.5 border-b border-white/10 shrink-0">
        {(
          [
            ['weapons', 'Weapons'],
            ['skins', 'Weapon skins'],
            ['powerups', 'Power-ups'],
            ['economy', 'Economy'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg ${
              section === id
                ? 'bg-amber-500/25 text-amber-100 border border-amber-400/40'
                : 'text-white/45 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {section === 'economy' && (
          <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">Credits</p>
            {(
              [
                ['startingCredits', 'Starting credits (each buy phase)', settings.startingCredits],
                ['creditsPerKill', 'Credits per kill', settings.creditsPerKill],
                ['creditsPerWaveClear', 'Credits per wave clear (Horde)', settings.creditsPerWaveClear],
              ] as const
            ).map(([key, label, value]) => (
              <label key={key} className="block text-[10px] text-white/55">
                {label}
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded bg-black/40 border border-white/15 px-2 py-1.5 text-xs text-white"
                  value={value}
                  onChange={(e) => {
                    setSettings((p) => ({
                      ...p,
                      [key]: Math.max(0, Number(e.target.value) || 0),
                    }));
                    setDirty(true);
                  }}
                />
              </label>
            ))}
            <p className="text-[9px] text-white/35 leading-snug">
              Players see credits in the HUD and buy menu. Price 0 = free. Kill / wave rewards stack
              during the match.
            </p>
          </div>
        )}

        {section === 'weapons' && (
          <>
            <div className="rounded-lg border border-dashed border-amber-400/30 bg-amber-500/5 p-2 space-y-1.5">
              <p className="text-[10px] font-bold text-amber-200/90 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Quick add presets
              </p>
              <div className="flex flex-wrap gap-1">
                {QUICK_PRESETS.map((p) => {
                  const exists = settings.items.some(
                    (it) => it.id === p.id || it.catalogId === p.id
                  );
                  const enabled = settings.items.some(
                    (it) => (it.id === p.id || it.catalogId === p.id) && it.enabled
                  );
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addFromCatalog(p.id)}
                      className={`text-[9px] px-2 py-1 rounded border font-bold ${
                        enabled
                          ? 'border-emerald-400/50 text-emerald-200 bg-emerald-500/15'
                          : exists
                            ? 'border-white/20 text-white/50'
                            : 'border-amber-400/40 text-amber-100 hover:bg-amber-500/20'
                      }`}
                    >
                      {exists && enabled ? '✓ ' : '+ '}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {settings.items.map((it) => (
              <div
                key={it.id}
                className={`rounded-lg border p-2 space-y-1.5 ${
                  it.enabled ? 'border-white/15 bg-white/5' : 'border-white/5 bg-black/20 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  {it.kind === 'melee' ? (
                    <Sword className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                  ) : (
                    <Crosshair className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                  )}
                  <input
                    className="flex-1 min-w-0 bg-transparent text-xs font-bold text-white border-b border-transparent focus:border-white/20 outline-none"
                    value={it.label}
                    onChange={(e) => patchItem(it.id, { label: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-[9px] text-white/50 shrink-0">
                    <input
                      type="checkbox"
                      className="accent-amber-400"
                      checked={it.enabled}
                      onChange={(e) => patchItem(it.id, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[9px] text-white/45">
                    Price (credits)
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.shopPrice}
                      onChange={(e) =>
                        patchItem(it.id, { shopPrice: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Damage{it.pellets && it.pellets > 1 ? ' / pellet' : ''}
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.damage}
                      onChange={(e) =>
                        patchItem(it.id, { damage: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Range
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.range}
                      onChange={(e) =>
                        patchItem(it.id, { range: Math.max(0.5, Number(e.target.value) || 0.5) })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Cooldown ms
                    <input
                      type="number"
                      min={50}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.cooldownMs}
                      onChange={(e) =>
                        patchItem(it.id, {
                          cooldownMs: Math.max(50, Number(e.target.value) || 50),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Cone (spread)
                    <input
                      type="number"
                      min={0.02}
                      max={1.2}
                      step={0.01}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.coneRadians}
                      onChange={(e) =>
                        patchItem(it.id, {
                          coneRadians: Math.max(0.02, Number(e.target.value) || 0.02),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Fire mode
                    <select
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.fireMode || 'semi'}
                      onChange={(e) =>
                        patchItem(it.id, {
                          fireMode: e.target.value as 'auto' | 'semi' | 'bolt',
                        })
                      }
                    >
                      <option value="auto">Auto (hold)</option>
                      <option value="semi">Semi (1 click)</option>
                      <option value="bolt">Bolt (sniper)</option>
                    </select>
                  </label>
                  <label className="text-[9px] text-white/45">
                    Pellets
                    <input
                      type="number"
                      min={1}
                      max={16}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.pellets ?? 1}
                      onChange={(e) =>
                        patchItem(it.id, {
                          pellets: Math.max(1, Math.min(16, Math.floor(Number(e.target.value) || 1))),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Mag size
                    <input
                      type="number"
                      min={0}
                      max={120}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.magSize ?? (it.kind === 'melee' ? 0 : 12)}
                      onChange={(e) =>
                        patchItem(it.id, {
                          magSize: Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0))),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Reserve
                    <input
                      type="number"
                      min={0}
                      max={400}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.reserveAmmo ?? 0}
                      onChange={(e) =>
                        patchItem(it.id, {
                          reserveAmmo: Math.max(0, Math.min(400, Math.floor(Number(e.target.value) || 0))),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Reload ms
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      step={50}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.reloadMs ?? 0}
                      onChange={(e) =>
                        patchItem(it.id, {
                          reloadMs: Math.max(0, Math.min(5000, Math.floor(Number(e.target.value) || 0))),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    ADS zoom FOV
                    <input
                      type="number"
                      min={0}
                      max={90}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.adsZoomFov ?? 0}
                      onChange={(e) =>
                        patchItem(it.id, {
                          adsZoomFov: Math.max(0, Math.min(90, Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    ADS cone ×
                    <input
                      type="number"
                      min={0.1}
                      max={2}
                      step={0.05}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.adsConeScale ?? 1}
                      onChange={(e) =>
                        patchItem(it.id, {
                          adsConeScale: Math.max(0.1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </label>
                  <label className="text-[9px] text-white/45">
                    Hipfire cone ×
                    <input
                      type="number"
                      min={0.5}
                      max={6}
                      step={0.1}
                      className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                      value={it.hipfireConeScale ?? 1}
                      onChange={(e) =>
                        patchItem(it.id, {
                          hipfireConeScale: Math.max(0.5, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </label>
                </div>

                <div className="rounded border border-white/10 bg-black/25 p-1.5 space-y-1">
                  <p className="text-[9px] font-bold text-white/45 uppercase tracking-wide">
                    Weapon texture
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[9px] px-2 py-1 rounded border border-white/15 text-white/70 hover:bg-white/10"
                      onClick={() => {
                        texTargetKey.current = `item:${it.id}`;
                        texRef.current?.click();
                      }}
                    >
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                    {it.textureUrl && (
                      <>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-[9px] px-2 py-1 rounded border border-sky-400/30 text-sky-200 hover:bg-sky-500/15"
                          onClick={() =>
                            downloadUrl(it.textureUrl!, `${it.id}-texture.png`)
                          }
                        >
                          <Download className="w-3 h-3" /> Download
                        </button>
                        <button
                          type="button"
                          className="text-[9px] px-2 py-1 rounded border border-rose-400/30 text-rose-200"
                          onClick={() => patchItem(it.id, { textureUrl: undefined })}
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                  {it.textureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.textureUrl}
                      alt=""
                      className="h-12 w-12 rounded object-cover border border-white/10"
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMode(it.id, 'horde')}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                      it.modes.includes('horde')
                        ? 'border-rose-400/50 text-rose-200 bg-rose-500/20'
                        : 'border-white/10 text-white/35'
                    }`}
                  >
                    Horde
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMode(it.id, 'competitive')}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                      it.modes.includes('competitive')
                        ? 'border-orange-400/50 text-orange-200 bg-orange-500/20'
                        : 'border-white/10 text-white/35'
                    }`}
                  >
                    Competitive
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="ml-auto text-[9px] text-red-300/80 hover:text-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {section === 'skins' && (
          <div className="space-y-2">
            <p className="text-[10px] text-white/45 leading-snug">
              Admin: upload/edit a weapon texture, name the skin, set price, save. In the match shop
              players buy it as a <span className="text-cyan-200/90">weapon skin</span> — not as a
              raw texture. Equipping paints it onto their held weapon.
            </p>
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 rounded-lg border border-dashed border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/15"
              onClick={() => {
                texTargetKey.current = 'skin-new';
                texRef.current?.click();
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload texture → create weapon skin
            </button>

            {skins.length === 0 && (
              <p className="text-[10px] text-white/35 text-center py-4">
                No weapon skins yet. Upload a PNG/JPG/WebP to create one.
              </p>
            )}

            {skins.map((sk) => (
              <div
                key={sk.id}
                className={`rounded-lg border p-2 space-y-1.5 ${
                  sk.enabled ? 'border-cyan-400/30 bg-cyan-500/10' : 'border-white/5 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {sk.textureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sk.textureUrl}
                      alt=""
                      className="h-10 w-10 rounded object-cover border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-black/40 border border-white/10 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-wide text-cyan-300/70 mb-0.5">
                      Weapon skin
                    </p>
                    <input
                      className="w-full min-w-0 bg-transparent text-xs font-bold text-white outline-none"
                      value={sk.label}
                      onChange={(e) => patchSkin(sk.id, { label: e.target.value })}
                      placeholder="Skin name (shown in shop)"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-[9px] text-white/50 shrink-0">
                    <input
                      type="checkbox"
                      className="accent-cyan-400"
                      checked={sk.enabled}
                      onChange={(e) => patchSkin(sk.id, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                </div>
                <label className="block text-[9px] text-white/45">
                  Price (credits)
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                    value={sk.shopPrice}
                    onChange={(e) =>
                      patchSkin(sk.id, { shopPrice: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
                <input
                  className="w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[10px] text-white/70"
                  placeholder="Shop description (optional)"
                  value={sk.description || ''}
                  onChange={(e) => patchSkin(sk.id, { description: e.target.value || undefined })}
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[9px] px-2 py-1 rounded border border-white/15 text-white/70 hover:bg-white/10"
                    onClick={() => {
                      texTargetKey.current = `skin:${sk.id}`;
                      texRef.current?.click();
                    }}
                  >
                    <Upload className="w-3 h-3" /> Edit texture
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[9px] px-2 py-1 rounded border border-sky-400/30 text-sky-200"
                    onClick={() => downloadUrl(sk.textureUrl, `${sk.id}-texture.png`)}
                  >
                    <Download className="w-3 h-3" /> Download
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSkinMode(sk.id, 'horde')}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                      sk.modes.includes('horde')
                        ? 'border-rose-400/50 text-rose-200 bg-rose-500/20'
                        : 'border-white/10 text-white/35'
                    }`}
                  >
                    Horde
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSkinMode(sk.id, 'competitive')}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                      sk.modes.includes('competitive')
                        ? 'border-orange-400/50 text-orange-200 bg-orange-500/20'
                        : 'border-white/10 text-white/35'
                    }`}
                  >
                    Competitive
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSkin(sk.id)}
                    className="ml-auto text-[9px] text-red-300/80 hover:text-red-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'powerups' && (
          <div className="space-y-2">
            <p className="text-[10px] text-white/45 leading-snug">
              Power-ups appear in the live buy menu. Heal / shield / energy apply instantly.
            </p>
            {powerUps.map((pu) => (
              <div
                key={pu.id}
                className={`rounded-lg border p-2 space-y-1.5 ${
                  pu.enabled ? 'border-violet-400/30 bg-violet-500/10' : 'border-white/5 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-violet-300" />
                  <input
                    className="flex-1 bg-transparent text-xs font-bold text-white outline-none"
                    value={pu.label}
                    onChange={(e) => patchPower(pu.id, { label: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-[9px] text-white/50">
                    <input
                      type="checkbox"
                      className="accent-violet-400"
                      checked={pu.enabled}
                      onChange={(e) => patchPower(pu.id, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                </div>
                <label className="block text-[9px] text-white/45">
                  Price
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 w-full rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                    value={pu.shopPrice}
                    onChange={(e) =>
                      patchPower(pu.id, { shopPrice: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
                <p className="text-[9px] text-white/35">{pu.description || pu.effect}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        ref={texRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const key = texTargetKey.current;
          e.target.value = '';
          if (!file || !key) return;
          const url = await fileToDataUrl(file);
          if (!url) return;
          if (key === 'skin-new') {
            addSkin(url);
            return;
          }
          if (key.startsWith('skin:')) {
            patchSkin(key.slice(5), { textureUrl: url });
            return;
          }
          if (key.startsWith('item:')) {
            patchItem(key.slice(5), { textureUrl: url });
          }
        }}
      />

      <div className="shrink-0 border-t border-white/10 p-2.5 flex items-center gap-2 bg-black/40">
        <Button size="sm" variant="ghost" onClick={resetDefaults} className="text-white/50 gap-1">
          <RotateCcw className="w-3.5 h-3.5" />
          Defaults
        </Button>
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty}
          className={`flex-1 gap-1 ${dirty ? 'bg-amber-500 hover:bg-amber-400 text-black' : ''}`}
        >
          <Save className="w-3.5 h-3.5" />
          {dirty ? 'Save shop to map' : 'Saved'}
        </Button>
      </div>
    </div>
  );
}
