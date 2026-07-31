'use client';

import React, { useEffect, useState } from 'react';
import {
  getActivePowerDefinitions,
  getAbilitySlotKind,
  getEnergyCostForAbility,
  getCooldownForAbility,
  type AbilitySlotKind,
} from '@shared/power-definitions';
import type { NetAbilityLoadoutState } from '../net/types';
import type { AbilityLevels } from '@shared/ability-progression';

const SLOT_FIELDS: Record<AbilitySlotKind, { endsAt: keyof NetAbilityLoadoutState; cooldownEndsAt: keyof NetAbilityLoadoutState }> = {
  visibility: { endsAt: 'visibilityEndsAt', cooldownEndsAt: 'visibilityCooldownEndsAt' },
  fly: { endsAt: 'flyEndsAt', cooldownEndsAt: 'flyCooldownEndsAt' },
  berserk: { endsAt: 'berserkEndsAt', cooldownEndsAt: 'berserkCooldownEndsAt' },
  bullet: { endsAt: 'bulletEndsAt', cooldownEndsAt: 'bulletCooldownEndsAt' },
  hook: { endsAt: 'hookEndsAt', cooldownEndsAt: 'hookCooldownEndsAt' },
  backflip: { endsAt: 'backflipEndsAt', cooldownEndsAt: 'backflipCooldownEndsAt' },
  thunder: { endsAt: 'thunderEndsAt', cooldownEndsAt: 'thunderCooldownEndsAt' },
};

/** Re-renders on a rAF loop only while a cooldown is actively counting down
 * (self-contained, same pattern as hud.tsx's useSmooth — doesn't rely on the
 * parent re-rendering at network tick rate). */
function useNowWhileActive(endsAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt <= Date.now()) {
      setNow(Date.now());
      return;
    }
    let raf = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t < endsAt) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  return now;
}

function AbilityRingIcon({
  icon,
  cooldownMs,
  cooldownEndsAt,
  buffEndsAt,
  energyCost,
  playerEnergy,
}: {
  icon: string;
  cooldownMs: number;
  cooldownEndsAt: number;
  buffEndsAt: number;
  energyCost: number;
  playerEnergy: number;
}) {
  const now = useNowWhileActive(Math.max(cooldownEndsAt, buffEndsAt));
  const onCooldown = cooldownEndsAt > now;
  const buffActive = buffEndsAt > now;
  const remaining = onCooldown ? cooldownEndsAt - now : 0;
  const progress = onCooldown && cooldownMs > 0 ? Math.max(0, Math.min(1, 1 - remaining / cooldownMs)) : 1;
  const canAfford = playerEnergy >= energyCost;

  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-[3px] rounded-full flex items-center justify-center text-[17px] leading-none"
        style={{
          background: buffActive ? 'rgba(120,220,255,0.35)' : 'rgba(10,16,28,0.78)',
          border: `1.5px solid ${canAfford || onCooldown ? 'rgba(255,255,255,0.32)' : 'rgba(255,80,80,0.55)'}`,
          filter: onCooldown && !buffActive ? 'grayscale(0.65) brightness(0.6)' : 'none',
          transition: 'filter 0.15s ease-out',
        }}
      >
        <span aria-hidden>{icon}</span>
      </div>
      {onCooldown && (
        <svg width={size} height={size} className="absolute inset-0 -rotate-90 pointer-events-none">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(130,205,255,0.95)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
      )}
      {buffActive && (
        <div
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400"
          style={{ boxShadow: '0 0 6px 2px rgba(52,211,153,0.85)' }}
        />
      )}
    </div>
  );
}

/**
 * Row of radial cooldown rings for every unlocked activatable power — icon
 * centered, ring drains from full (just used) to empty (ready), then the
 * ring itself disappears once the power is available again.
 */
export const AbilityCooldownRow: React.FC<{
  abilities?: NetAbilityLoadoutState;
  abilityLevels?: AbilityLevels | null;
  playerEnergy: number;
}> = ({ abilities, abilityLevels, playerEnergy }) => {
  const defs = getActivePowerDefinitions().filter((def) => {
    if (def.effectType === 'stat_bonus') return false;
    if ((abilityLevels?.[def.key] ?? 0) <= 0) return false;
    return getAbilitySlotKind(def.key) !== null;
  });
  if (defs.length === 0) return null;

  return (
    <div className="flex items-end gap-2">
      {defs.map((def) => {
        const slot = getAbilitySlotKind(def.key);
        if (!slot) return null;
        const fields = SLOT_FIELDS[slot];
        return (
          <AbilityRingIcon
            key={def.key}
            icon={def.icon}
            cooldownMs={getCooldownForAbility(def.key)}
            cooldownEndsAt={abilities?.[fields.cooldownEndsAt] ?? 0}
            buffEndsAt={abilities?.[fields.endsAt] ?? 0}
            energyCost={getEnergyCostForAbility(def.key)}
            playerEnergy={playerEnergy}
          />
        );
      })}
    </div>
  );
};
