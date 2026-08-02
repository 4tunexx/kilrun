'use client';

import { useEffect, useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  getAvailableCases,
  openCase,
  type CaseDto,
  type CaseOpenResultDto,
} from '@/lib/case-actions';
import { CrateUnboxModal } from '@/components/crate-unbox-modal';
import { CrateContentsPreview } from '@/components/crate-contents-preview';

function timeUntil(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function CasesView() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CaseOpenResultDto | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setCases(await getAvailableCases('cases'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleOpen = async (c: CaseDto) => {
    setBusy(true);
    try {
      const res = await openCase(c.id);
      setResult(res);
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Could not open case',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const closeUnbox = () => {
    setResult(null);
    void refresh();
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <div className="flex items-center gap-2 text-slate-100">
        <Gift className="h-5 w-5 text-amber-400" />
        <h1 className="text-xl font-bold">Cases</h1>
      </div>

      {result && <CrateUnboxModal result={result} onClose={closeUnbox} />}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
        </div>
      ) : cases.length === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No cases available right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cases.map((c) => (
            <Card key={c.id} className="bg-slate-900/50 border-slate-700/50 overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="block w-full text-left group"
                      title="Tap to see what's inside"
                    >
                      <div className="aspect-square w-full rounded-lg bg-slate-950/60 border border-slate-700 flex items-center justify-center overflow-hidden p-3 group-hover:border-amber-500/50 transition-colors">
                        {c.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.imageUrl}
                            alt=""
                            className="h-full w-full object-contain drop-shadow-[0_0_20px_rgba(251,191,36,0.25)]"
                          />
                        ) : (
                          <Gift className="h-14 w-14 text-slate-500" />
                        )}
                      </div>
                      <div className="mt-2">
                        <p className="text-sm font-semibold text-slate-100 truncate">{c.name}</p>
                        {c.description && (
                          <p className="text-[11px] text-slate-500 truncate">{c.description}</p>
                        )}
                        <p className="text-[10px] text-amber-400/80 mt-0.5">Tap to view contents</p>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 bg-slate-900 border-slate-700 p-3">
                    <CrateContentsPreview name={c.name} items={c.items} />
                  </PopoverContent>
                </Popover>

                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy || !c.canOpen}
                  onClick={() => void handleOpen(c)}
                >
                  {c.canOpen ? 'Open free case' : `Available in ${timeUntil(c.nextFreeAt)}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
