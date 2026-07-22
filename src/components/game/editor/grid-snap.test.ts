import { describe, expect, it } from 'vitest';
import {
  entityWorldSize,
  snapPoseToGridEdges,
  snapScaleToGrid,
  snapToGrid,
  yawAlignedSize,
  scaleFromSideOffset,
} from '@/components/game/editor/map-document';

describe('Shift exact-grid snap helpers', () => {
  it('snapToGrid rounds to cell centers', () => {
    expect(snapToGrid(1.4, 1)).toBe(1);
    expect(snapToGrid(1.6, 1)).toBe(2);
    expect(snapToGrid(2.4, 0.5)).toBe(2.5);
  });

  it('snapScaleToGrid forces world size onto grid multiples', () => {
    // base 2×0.25×2, free scale ~1.3 → world ~2.6 → snaps to 3, 1, 3
    const next = snapScaleToGrid([1.3, 1.1, 1.3], [2, 0.25, 2], 1);
    expect(entityWorldSize([2, 0.25, 2], next)).toEqual([3, 1, 3]);
  });

  it('snapScaleToGrid never collapses an axis below one grid cell', () => {
    const next = snapScaleToGrid([0.01, 0.01, 0.01], [2, 2, 2], 1);
    expect(entityWorldSize([2, 2, 2], next)).toEqual([1, 1, 1]);
  });

  it('snapPoseToGridEdges seats XZ edges and Y feet on the grid', () => {
    // size 2×1×2 centered near origin → edges at ±1
    const pos = snapPoseToGridEdges([0.3, 0.4, -0.2], [2, 1, 2], 1);
    expect(pos[0]).toBe(0); // left -1, right +1
    expect(pos[1]).toBe(0);
    expect(pos[2]).toBe(0);
  });

  it('snapPoseToGridEdges keeps odd widths edge-aligned', () => {
    // width 1 → center must sit on half-grid so edges hit integers
    const pos = snapPoseToGridEdges([0.1, 0, 0.1], [1, 1, 1], 1);
    expect(pos[0]).toBe(0.5);
    expect(pos[2]).toBe(0.5);
    expect(pos[0] - 0.5).toBe(0); // left edge
    expect(pos[0] + 0.5).toBe(1); // right edge
  });

  it('yawAlignedSize swaps X/Z at 90° and 270°', () => {
    expect(yawAlignedSize([3, 1, 1], 90)).toEqual([1, 1, 3]);
    expect(yawAlignedSize([3, 1, 1], 270)).toEqual([1, 1, 3]);
    expect(yawAlignedSize([3, 1, 1], 0)).toEqual([3, 1, 1]);
    expect(yawAlignedSize([3, 1, 1], 180)).toEqual([3, 1, 1]);
  });

  it('scaleFromSideOffset keeps the opposite face fixed on X/Z', () => {
    // width 2→4 at scale 1→2 with base 2 → offset +1 so left edge stays
    expect(scaleFromSideOffset([1, 1, 1], [2, 1, 1], [2, 1, 2])).toEqual([1, 0, 0]);
    expect(scaleFromSideOffset([1, 1, 1], [1, 1, 2], [2, 1, 2])).toEqual([0, 0, 1]);
  });
});
