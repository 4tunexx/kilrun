import { prisma } from '@/lib/prisma';
import { persistSoundFile } from '@/lib/sound-asset-upload';
import { invalidateSoundDefinitionsCache } from '@/lib/sound-definitions';
import { isWritableSoundEventKey } from '@/lib/sound-event-key';

export { isWritableSoundEventKey } from '@/lib/sound-event-key';

export const SOUND_FX_KEYS = [
  'trimStartMs',
  'trimEndMs',
  'lowCutHz',
  'highCutHz',
  'bassGain',
  'trebleGain',
  'noiseGateDb',
] as const;
export type SoundFxKey = (typeof SOUND_FX_KEYS)[number];
export type SoundFxUpdate = Partial<Record<SoundFxKey, number | null>>;

function resetFx(): SoundFxUpdate {
  const out: SoundFxUpdate = {};
  for (const k of SOUND_FX_KEYS) out[k] = null;
  return out;
}

export async function uploadSoundDefinition(input: {
  eventKey: string;
  file: File;
  volume?: number;
}): Promise<{ eventKey: string; fileUrl: string }> {
  const eventKey = input.eventKey.trim();
  if (!isWritableSoundEventKey(eventKey)) {
    throw new Error('Unknown event key');
  }
  const file = input.file;
  const nameLower = file.name.toLowerCase();
  const isWav = file.type === 'audio/wav' || file.type === 'audio/x-wav' || nameLower.endsWith('.wav');
  const isMp3 = file.type === 'audio/mpeg' || file.type === 'audio/mp3' || nameLower.endsWith('.mp3');
  if (!isWav && !isMp3) throw new Error('File must be .wav or .mp3');
  if (file.size > 5_000_000) throw new Error('Sound file too large (max ~5MB)');
  const volume = Math.max(0, Math.min(1, Number(input.volume) || 1));
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = isWav ? 'audio/wav' : 'audio/mpeg';
  const fileUrl = await persistSoundFile(buffer, eventKey, contentType);
  await prisma.soundDefinition.upsert({
    where: { eventKey },
    create: { eventKey, fileUrl, fileName: file.name, volume, ...resetFx() },
    update: { fileUrl, fileName: file.name, volume, ...resetFx() },
  });
  invalidateSoundDefinitionsCache();
  return { eventKey, fileUrl };
}

export async function patchSoundDefinition(
  eventKeyRaw: string,
  body: Record<string, unknown>
): Promise<void> {
  const eventKey = eventKeyRaw.trim();
  if (!eventKey) throw new Error('eventKey is required');
  const existing = await prisma.soundDefinition.findUnique({ where: { eventKey } });
  if (!existing) throw new Error('No sound bound to this event yet');
  const data: SoundFxUpdate & { volume?: number } = {};
  if (Object.prototype.hasOwnProperty.call(body, 'volume')) {
    data.volume = Math.max(0, Math.min(1, Number(body.volume) || 0));
  }
  for (const k of SOUND_FX_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const raw = body[k];
    data[k] = raw == null ? null : Number(raw);
  }
  if (Object.keys(data).length === 0) throw new Error('No fields to update');
  await prisma.soundDefinition.update({ where: { eventKey }, data });
  invalidateSoundDefinitionsCache();
}

export async function deleteSoundDefinition(eventKeyRaw: string): Promise<void> {
  const eventKey = eventKeyRaw.trim();
  if (!eventKey) throw new Error('eventKey is required');
  await prisma.soundDefinition.deleteMany({ where: { eventKey } });
  invalidateSoundDefinitionsCache();
}
