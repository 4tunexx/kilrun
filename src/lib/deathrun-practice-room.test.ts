import { describe, expect, it } from 'vitest';

describe('DeathrunPracticeRoom', () => {
  it('starts with one player', async () => {
    const { DeathrunPracticeRoom } = await import(
      new URL('../../server/src/rooms/DeathrunPracticeRoom.js', import.meta.url).href
    );
    const room = new DeathrunPracticeRoom() as unknown as { minPlayersToStart: number };
    expect(room.minPlayersToStart).toBe(1);
  }, 15_000);
});
