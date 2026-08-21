import { describe, expect, it } from 'vitest';
import { SOUND_EVENTS } from '@shared/sound-events';
import { isWritableSoundEventKey } from '@/lib/sound-event-key';

describe('isWritableSoundEventKey', () => {
  it('allows catalog keys and custom_move_ keys', () => {
    expect(isWritableSoundEventKey(SOUND_EVENTS[0].key)).toBe(true);
    expect(isWritableSoundEventKey('custom_move_slidekick')).toBe(true);
    expect(isWritableSoundEventKey('not_a_real_event')).toBe(false);
  });
});
