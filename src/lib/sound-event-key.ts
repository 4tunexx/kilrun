import { getSoundEventDef } from '@shared/sound-events';

/** Catalog events plus map-authored custom moves (`custom_move_<id>`). */
export function isWritableSoundEventKey(eventKey: string): boolean {
  return Boolean(getSoundEventDef(eventKey) || eventKey.startsWith('custom_move_'));
}
