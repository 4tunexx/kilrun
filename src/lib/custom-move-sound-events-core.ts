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
