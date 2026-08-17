/**
 * Uniform XY grid so platformer collision does not scan every pad every tick.
 * Used by the Colyseus sim and Map Play Test.
 */

export interface SpatialPad {
  x: number;
  y: number;
  width: number;
  depth: number;
  rotYaw?: number;
  motionAmpX?: number;
  motionAmpY?: number;
}

const DEFAULT_CELL = 8;
const NEIGHBOR_RADIUS = 1;

function cellKey(ix: number, iy: number): number {
  // 16-bit cell coords, biased so negatives pack cleanly.
  return ((ix + 32768) << 16) | (iy + 32768);
}

function padAabb(pad: SpatialPad): { minX: number; maxX: number; minY: number; maxY: number } {
  const hw = Math.max(0.01, pad.width / 2);
  const hd = Math.max(0.01, pad.depth / 2);
  const yaw = pad.rotYaw || 0;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const extX = hw * c + hd * s;
  const extY = hw * s + hd * c;
  const ampX = Math.abs(pad.motionAmpX ?? 0);
  const ampY = Math.abs(pad.motionAmpY ?? 0);
  return {
    minX: pad.x - extX - ampX,
    maxX: pad.x + extX + ampX,
    minY: pad.y - extY - ampY,
    maxY: pad.y + extY + ampY,
  };
}

export class PadSpatialIndex<T extends SpatialPad> {
  private readonly cellSize: number;
  private readonly cells = new Map<number, T[]>();
  private all: T[] = [];

  constructor(cellSize = DEFAULT_CELL) {
    this.cellSize = Math.max(2, cellSize);
  }

  rebuild(pads: Iterable<T>): this {
    this.cells.clear();
    this.all = [];
    const inv = 1 / this.cellSize;
    for (const pad of pads) {
      this.all.push(pad);
      const box = padAabb(pad);
      const ix0 = Math.floor(box.minX * inv);
      const ix1 = Math.floor(box.maxX * inv);
      const iy0 = Math.floor(box.minY * inv);
      const iy1 = Math.floor(box.maxY * inv);
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const k = cellKey(ix, iy);
          let bucket = this.cells.get(k);
          if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
          }
          bucket.push(pad);
        }
      }
    }
    return this;
  }

  /** Pads overlapping the query point's neighborhood (unique). */
  nearby(x: number, y: number): T[] {
    if (this.all.length === 0) return this.all;
    const ix = Math.floor(x / this.cellSize);
    const iy = Math.floor(y / this.cellSize);
    const seen = new Set<T>();
    const out: T[] = [];
    for (let dy = -NEIGHBOR_RADIUS; dy <= NEIGHBOR_RADIUS; dy++) {
      for (let dx = -NEIGHBOR_RADIUS; dx <= NEIGHBOR_RADIUS; dx++) {
        const bucket = this.cells.get(cellKey(ix + dx, iy + dy));
        if (!bucket) continue;
        for (const pad of bucket) {
          if (seen.has(pad)) continue;
          seen.add(pad);
          out.push(pad);
        }
      }
    }
    return out;
  }

  get size(): number {
    return this.all.length;
  }
}
