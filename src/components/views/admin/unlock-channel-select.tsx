'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UnlockChannel } from '@/lib/requirement-catalog';
import { DEFAULT_UNLOCK_CHANNELS } from '@/lib/requirement-catalog';
import { getRequirementCatalog } from '@/lib/requirement-actions';

/** Shop / listing “Obtained via” dropdown (purchase, event, mission, …). */
export function UnlockChannelSelect({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [channels, setChannels] = useState<UnlockChannel[]>(DEFAULT_UNLOCK_CHANNELS);

  useEffect(() => {
    let alive = true;
    getRequirementCatalog()
      .then((cat) => {
        if (!alive) return;
        const enabled = cat.unlockChannels.filter((c) => c.enabled);
        setChannels(enabled.length ? enabled : DEFAULT_UNLOCK_CHANNELS);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const selected = channels.find((c) => c.id === value);

  return (
    <div className="space-y-1">
      <Select value={value || 'purchase'} onValueChange={onValueChange}>
        <SelectTrigger className={className ?? 'h-8 bg-slate-900/50 border-slate-700'}>
          <SelectValue placeholder="Obtained via" />
        </SelectTrigger>
        <SelectContent>
          {channels.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
          {/* Keep current value visible even if channel was disabled. */}
          {value && !channels.some((c) => c.id === value) && (
            <SelectItem value={value}>{value}</SelectItem>
          )}
        </SelectContent>
      </Select>
      {selected?.hint && <p className="text-[10px] text-slate-500">{selected.hint}</p>}
    </div>
  );
}
