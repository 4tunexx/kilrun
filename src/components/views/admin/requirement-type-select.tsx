'use client';

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
  getRequirementType,
  groupRequirementTypes,
  type RequirementCategory,
} from '@/lib/requirement-types';

/** Dropdown of every supported progression requirement, grouped by category. */
export function RequirementTypeSelect({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const groups = groupRequirementTypes();
  const selected = getRequirementType(value);

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={className ?? 'bg-slate-900/50 border-slate-700'}>
          <SelectValue placeholder="Select a requirement type" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(groups) as RequirementCategory[]).map((category) =>
            groups[category].length === 0 ? null : (
              <SelectGroup key={category}>
                <SelectLabel>{REQUIREMENT_CATEGORY_LABELS[category]}</SelectLabel>
                {groups[category].map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          )}
        </SelectContent>
      </Select>
      {selected && <p className="text-xs text-slate-500">{selected.description}</p>}
    </div>
  );
}
