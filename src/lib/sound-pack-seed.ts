import { DEFAULT_SOUND_BINDINGS, defaultSoundFileUrl } from '@shared/default-sound-pack';

type SoundDefClient = {
  soundDefinition: {
    findUnique: (args: { where: { eventKey: string } }) => Promise<{ eventKey: string } | null>;
    create: (args: {
      data: { eventKey: string; fileUrl: string; fileName: string; volume: number };
    }) => Promise<unknown>;
  };
};

/** Create SoundDefinition rows for pack defaults that are not in the DB yet. Never overwrites. */
export async function seedMissingSoundDefinitions(db: SoundDefClient): Promise<number> {
  let created = 0;
  for (const row of DEFAULT_SOUND_BINDINGS) {
    const existing = await db.soundDefinition.findUnique({ where: { eventKey: row.eventKey } });
    if (existing) continue;
    await db.soundDefinition.create({
      data: {
        eventKey: row.eventKey,
        fileUrl: defaultSoundFileUrl(row.file),
        fileName: row.fileName,
        volume: 1,
      },
    });
    created += 1;
  }
  return created;
}
