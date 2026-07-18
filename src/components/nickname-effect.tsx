'use client';

import {
  nicknameEffectClass,
  nicknameEffectStyle,
  normalizeNicknameConfig,
  type NicknameConfig,
} from '@/lib/cosmetics';
import { cn } from '@/lib/utils';

export function NicknameEffectText({
  name,
  effect,
  className,
}: {
  name: string;
  effect?: NicknameConfig | null | unknown;
  className?: string;
}) {
  const cfg = effect ? normalizeNicknameConfig(effect) : null;
  return (
    <span
      className={cn(nicknameEffectClass(cfg), className)}
      style={nicknameEffectStyle(cfg)}
    >
      {name}
    </span>
  );
}
