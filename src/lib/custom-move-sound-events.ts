'use server';

/**
 * Aggregates every map-authored custom move (Player Model Studio → Moves)
 * across all published maps into Sound Board catalog entries, so an admin
 * sees a row to bind a clip to per move without hand-typing a matching key
 * — same "map content auto-registers into the global systems" pattern
 * already used for custom-move → PowerDefinition auto-sync (see
 * scheduleMovePowerSync in player-model-studio.tsx). The event key itself
 * (customMoveSoundKey) requires no DB row to exist — playSound() on an
 * unbound key is already a silent no-op — this just drives the *listing*.
 */

import { prisma } from '@/lib/prisma';
import { customMoveSoundKey, type CustomMoveDef } from '@shared/custom-moves';
import type { SoundEventDef } from '@shared/sound-events';

export async function getCustomMoveSoundEvents(): Promise<SoundEventDef[]> {
  const rows = await prisma.gameMap.findMany({ select: { name: true, documentJson: true } });
  const out: SoundEventDef[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    let moves: CustomMoveDef[] | undefined;
    try {
      moves = (JSON.parse(row.documentJson) as { customMoves?: CustomMoveDef[] }).customMoves;
    } catch {
      continue;
    }
    for (const move of moves ?? []) {
      const key = customMoveSoundKey(move.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        label: `${move.name} (${row.name})`,
        category: 'Custom Moves',
        description: `Custom move on map "${row.name}" — edit in Player Model Studio → Moves.`,
      });
    }
  }
  return out;
}
