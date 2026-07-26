'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  REQUIREMENT_CATEGORY_LABELS,
  groupCatalogMetrics,
  type CatalogMetric,
  type RequirementCategory,
} from '@/lib/requirement-catalog';
import { getRequirementCatalog } from '@/lib/requirement-actions';

/** Dropdown of progression requirement metrics (missions / achievements / badges). */
export function RequirementTypeSelect({
  value,
  onValueChange,
  className,
  /** When set, only show these categories (e.g. daily missions). */
  categoriesFilter,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  categoriesFilter?: RequirementCategory[];
}) {
  const [metrics, setMetrics] = useState<CatalogMetric[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getRequirementCatalog()
      .then((cat) => {
        if (!alive) return;
        setMetrics(cat.metrics.filter((m) => m.enabled));
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = categoriesFilter?.length
    ? metrics.filter((m) => categoriesFilter.includes(m.category))
    : metrics;
  const groups = groupCatalogMetrics(filtered);
  const selected = filtered.find((m) => m.value === value) ?? metrics.find((m) => m.value === value);

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={className ?? 'bg-slate-900/50 border-slate-700'}>
          <SelectValue placeholder={loaded ? 'Select a requirement type' : 'Loading…'} />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(groups) as RequirementCategory[]).map((category) =>
            groups[category].length === 0 ? null : (
              <SelectGroup key={category}>
                <SelectLabel>{REQUIREMENT_CATEGORY_LABELS[category]}</SelectLabel>
                {groups[category].map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                    {type.source === 'custom' ? ' · custom' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          )}
        </SelectContent>
      </Select>
      {selected && (
        <p className="text-xs text-slate-500">
          {selected.description}
          {selected.source === 'custom' ? ' (custom counter)' : ''}
        </p>
      )}
    </div>
  );
}
