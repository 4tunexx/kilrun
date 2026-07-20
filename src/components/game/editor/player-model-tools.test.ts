import { describe, expect, it } from 'vitest';
import { createBondedPart } from '@/lib/player-skins';
import { bakeTimelineToClip } from '@/components/game/editor/player-mesh-edits';

describe('createBondedPart', () => {
  it('creates a unique bonded shape with defaults', () => {
    const a = createBondedPart('sphere');
    const b = createBondedPart('box');
    expect(a.id).not.toBe(b.id);
    expect(a.primitive).toBe('sphere');
    expect(b.primitive).toBe('box');
    expect(a.position).toHaveLength(3);
    expect(a.scale).toEqual([1, 1, 1]);
  });
});

describe('bakeTimelineToClip', () => {
  it('keys only the selected bone across timeline times', () => {
    const clip = bakeTimelineToClip('arm_wave', 'mixamorigRightArm', [
      {
        time: 0,
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      {
        time: 0.5,
        position: [0.1, 0, 0],
        quaternion: [0, 0.1, 0, 0.99],
        scale: [1, 1, 1],
      },
    ]);
    expect(clip.name).toBe('arm_wave');
    expect(clip.duration).toBe(0.5);
    expect(clip.tracks.every((t) => t.boneName === 'mixamorigRightArm')).toBe(true);
    expect(clip.tracks).toHaveLength(3);
    expect(clip.tracks.find((t) => t.property === 'quaternion')?.times).toEqual([0, 0.5]);
  });
});
