'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { useToast } from '@/hooks/use-toast';
import {
  adminAddCaseItem,
  adminCreateCase,
  adminDeleteCase,
  adminListCases,
  adminRemoveCaseItem,
  adminSearchAssetsForCase,
  adminSearchStoreItemsForCase,
  adminUpdateCase,
  adminUpdateCaseItem,
} from '@/lib/admin-case-actions';

type CaseRow = Awaited<ReturnType<typeof adminListCases>>[number];

const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
const ACQUIRE_TYPES = [
  { value: 'vp_purchase', label: 'Buy with VP' },
  { value: 'free_daily', label: 'Free — daily' },
  { value: 'free_weekly', label: 'Free — weekly' },
  { value: 'admin_grant', label: 'Admin grant only' },
];

export function AdminCasesPanel() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
  const [pickerTab, setPickerTab] = useState<'store' | 'asset' | 'currency'>('store');
  const [pickerQuery, setPickerQuery] = useState('');
  const [storeResults, setStoreResults] = useState<Awaited<ReturnType<typeof adminSearchStoreItemsForCase>>>([]);
  const [assetResults, setAssetResults] = useState<Awaited<ReturnType<typeof adminSearchAssetsForCase>>>([]);
  const [currencyDraft, setCurrencyDraft] = useState({ vpAmount: '0', xpAmount: '0', displayName: '' });

  const [newCase, setNewCase] = useState({ name: '', imageUrl: '', openImageUrl: '', description: '', acquireType: 'vp_purchase', vpPrice: '0' });
  const [editingImagesFor, setEditingImagesFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCases(await adminListCases());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pickerOpenFor) return;
    if (pickerTab === 'store') {
      void adminSearchStoreItemsForCase(pickerQuery).then(setStoreResults).catch(() => setStoreResults([]));
    } else {
      void adminSearchAssetsForCase(pickerQuery).then(setAssetResults).catch(() => setAssetResults([]));
    }
  }, [pickerOpenFor, pickerTab, pickerQuery]);

  const run = async (fn: () => Promise<unknown>, okTitle?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (okTitle) toast({ title: okTitle });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Create a case</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              value={newCase.name}
              onChange={(e) => setNewCase((f) => ({ ...f, name: e.target.value }))}
              placeholder="Case name"
              className="bg-slate-900/50 border-slate-700"
            />
            <Select
              value={newCase.acquireType}
              onValueChange={(v) => setNewCase((f) => ({ ...f, acquireType: v }))}
            >
              <SelectTrigger className="bg-slate-900/50 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACQUIRE_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newCase.acquireType === 'vp_purchase' && (
              <Input
                type="number"
                min={0}
                value={newCase.vpPrice}
                onChange={(e) => setNewCase((f) => ({ ...f, vpPrice: e.target.value }))}
                placeholder="VP price"
                className="bg-slate-900/50 border-slate-700"
              />
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <ImageUploadField
              label="Closed case image"
              value={newCase.imageUrl}
              onChange={(url) => setNewCase((f) => ({ ...f, imageUrl: url }))}
              kind="misc"
            />
            <ImageUploadField
              label="Opened case image (shown after the reveal spin)"
              value={newCase.openImageUrl}
              onChange={(url) => setNewCase((f) => ({ ...f, openImageUrl: url }))}
              kind="misc"
            />
          </div>
          <Textarea
            value={newCase.description}
            onChange={(e) => setNewCase((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
            className="bg-slate-900/50 border-slate-700 text-sm min-h-16"
          />
          <Button
            size="sm"
            disabled={busy || newCase.name.trim().length < 2}
            onClick={() =>
              void run(async () => {
                await adminCreateCase({
                  name: newCase.name,
                  imageUrl: newCase.imageUrl,
                  openImageUrl: newCase.openImageUrl,
                  description: newCase.description,
                  acquireType: newCase.acquireType,
                  vpPrice: Number(newCase.vpPrice) || 0,
                });
                setNewCase({ name: '', imageUrl: '', openImageUrl: '', description: '', acquireType: 'vp_purchase', vpPrice: '0' });
              }, 'Case created')
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create case
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
        </div>
      ) : cases.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No cases yet.</p>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => {
            const totalWeight = c.items.reduce((sum, i) => sum + i.dropWeight, 0);
            return (
              <Card key={c.id} className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" className="h-9 w-9 rounded object-cover border border-slate-700" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-slate-800 border border-slate-700" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">
                        {c.name}{' '}
                        {!c.isActive && <span className="text-[10px] text-rose-400 uppercase">Inactive</span>}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {ACQUIRE_TYPES.find((a) => a.value === c.acquireType)?.label ?? c.acquireType}
                        {c.acquireType === 'vp_purchase' ? ` · ${c.vpPrice} VP` : ''} · {c.items.length} items
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void run(() => adminUpdateCase(c.id, { isActive: !c.isActive }))
                      }
                      disabled={busy}
                    >
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditingImagesFor((id) => (id === c.id ? null : c.id))
                      }
                    >
                      {editingImagesFor === c.id ? 'Hide images' : 'Edit images'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
                    >
                      {expandedId === c.id ? 'Hide items' : 'Edit items'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete case "${c.name}"? This cannot be undone.`)) return;
                        void run(() => adminDeleteCase(c.id), 'Case deleted');
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {editingImagesFor === c.id && (
                    <div className="pt-2 border-t border-slate-800 grid sm:grid-cols-2 gap-3">
                      <ImageUploadField
                        label="Closed case image"
                        value={c.imageUrl}
                        onChange={(url) =>
                          void run(() => adminUpdateCase(c.id, { imageUrl: url }))
                        }
                        kind="misc"
                      />
                      <ImageUploadField
                        label="Opened case image"
                        value={c.openImageUrl}
                        onChange={(url) =>
                          void run(() => adminUpdateCase(c.id, { openImageUrl: url }))
                        }
                        kind="misc"
                      />
                    </div>
                  )}

                  {expandedId === c.id && (
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      {c.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-lg bg-slate-950/40 border border-slate-800 px-2.5 py-1.5"
                        >
                          {item.displayImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.displayImage} alt="" className="h-7 w-7 rounded object-cover" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-slate-800" />
                          )}
                          <span className="text-xs flex-1 truncate">{item.displayName}</span>
                          <Select
                            value={item.rarity}
                            onValueChange={(v) =>
                              void run(() => adminUpdateCaseItem(item.id, { rarity: v }))
                            }
                          >
                            <SelectTrigger className="h-7 w-28 bg-slate-900/50 border-slate-700 text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RARITIES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={1}
                            defaultValue={item.dropWeight}
                            className="h-7 w-20 bg-slate-900/50 border-slate-700 text-[11px]"
                            onBlur={(e) =>
                              void run(() =>
                                adminUpdateCaseItem(item.id, { dropWeight: Number(e.target.value) || 1 })
                              )
                            }
                          />
                          <span className="text-[10px] text-slate-500 w-12 text-right">
                            {totalWeight > 0 ? Math.round((item.dropWeight / totalWeight) * 1000) / 10 : 0}%
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1.5 text-rose-400"
                            disabled={busy}
                            onClick={() => void run(() => adminRemoveCaseItem(item.id), 'Item removed')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}

                      {pickerOpenFor === c.id ? (
                        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5 space-y-2">
                          <div className="flex gap-1">
                            {(['store', 'asset', 'currency'] as const).map((t) => (
                              <button
                                key={t}
                                type="button"
                                className={`text-[11px] px-2 py-1 rounded ${
                                  pickerTab === t
                                    ? 'bg-cyan-600/30 text-cyan-200'
                                    : 'text-slate-400 hover:bg-slate-800'
                                }`}
                                onClick={() => setPickerTab(t)}
                              >
                                {t === 'store' ? 'Store items' : t === 'asset' ? 'Assets' : 'VP / XP'}
                              </button>
                            ))}
                          </div>

                          {pickerTab !== 'currency' && (
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
                              <Input
                                value={pickerQuery}
                                onChange={(e) => setPickerQuery(e.target.value)}
                                placeholder="Search…"
                                className="h-7 pl-7 bg-slate-900/50 border-slate-700 text-xs"
                              />
                            </div>
                          )}

                          {pickerTab === 'currency' ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={currencyDraft.vpAmount}
                                  onChange={(e) =>
                                    setCurrencyDraft((f) => ({ ...f, vpAmount: e.target.value }))
                                  }
                                  placeholder="VP amount"
                                  className="h-7 bg-slate-900/50 border-slate-700 text-xs"
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  value={currencyDraft.xpAmount}
                                  onChange={(e) =>
                                    setCurrencyDraft((f) => ({ ...f, xpAmount: e.target.value }))
                                  }
                                  placeholder="XP amount"
                                  className="h-7 bg-slate-900/50 border-slate-700 text-xs"
                                />
                              </div>
                              <Input
                                value={currencyDraft.displayName}
                                onChange={(e) =>
                                  setCurrencyDraft((f) => ({ ...f, displayName: e.target.value }))
                                }
                                placeholder="Display name (optional, e.g. Lucky Bonus)"
                                className="h-7 bg-slate-900/50 border-slate-700 text-xs"
                              />
                              <Button
                                size="sm"
                                disabled={
                                  busy ||
                                  (Number(currencyDraft.vpAmount) <= 0 &&
                                    Number(currencyDraft.xpAmount) <= 0)
                                }
                                onClick={() =>
                                  void run(async () => {
                                    await adminAddCaseItem(c.id, {
                                      source: 'currency',
                                      vpAmount: Number(currencyDraft.vpAmount) || 0,
                                      xpAmount: Number(currencyDraft.xpAmount) || 0,
                                      displayName: currencyDraft.displayName,
                                    });
                                    setCurrencyDraft({ vpAmount: '0', xpAmount: '0', displayName: '' });
                                  }, 'Currency reward added')
                                }
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add currency reward
                              </Button>
                            </div>
                          ) : (
                            <div className="max-h-52 overflow-y-auto space-y-1">
                              {pickerTab === 'store'
                                ? storeResults.map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-800/80 rounded"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            adminAddCaseItem(c.id, {
                                              source: 'store',
                                              itemSku: s.itemSku,
                                            }),
                                          `Added ${s.itemName}`
                                        )
                                      }
                                    >
                                      <span className="flex-1 truncate">{s.itemName}</span>
                                      <span className="text-slate-500">{s.itemSku}</span>
                                    </button>
                                  ))
                                : assetResults.map((a) => (
                                    <button
                                      key={a.id}
                                      type="button"
                                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-800/80 rounded"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            adminAddCaseItem(c.id, {
                                              source: 'asset',
                                              assetId: a.id,
                                            }),
                                          `Added ${a.displayName}`
                                        )
                                      }
                                    >
                                      <span className="flex-1 truncate">{a.displayName}</span>
                                      <span className="text-slate-500">{a.category}</span>
                                    </button>
                                  ))}
                            </div>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setPickerOpenFor(null)}>
                            Close picker
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPickerOpenFor(c.id);
                            setPickerQuery('');
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add item
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
