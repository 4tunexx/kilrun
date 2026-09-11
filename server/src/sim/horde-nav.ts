/**
 * Pad-graph pathfinding for Horde monsters.
 * Walkable cells come from authored platforms; seekers follow A* waypoints
 * instead of walking through solid walls.
 */
export type NavPad = {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
};

export type NavPoint = { x: number; y: number };

const CELL = 1.2;
const MAX_NODES = 900;

function cellKey(ix: number, iy: number): string {
  return `${ix}:${iy}`;
}

export function buildPadNavGraph(pads: NavPad[]): {
  walkable: Set<string>;
  heightAt: Map<string, number>;
} {
  const walkable = new Set<string>();
  const heightAt = new Map<string, number>();
  for (const pad of pads) {
    const hx = Math.max(0.4, pad.width / 2);
    const hy = Math.max(0.4, pad.depth / 2);
    const minX = Math.floor((pad.x - hx) / CELL);
    const maxX = Math.floor((pad.x + hx) / CELL);
    const minY = Math.floor((pad.y - hy) / CELL);
    const maxY = Math.floor((pad.y + hy) / CELL);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        if (walkable.size >= MAX_NODES) return { walkable, heightAt };
        const key = cellKey(ix, iy);
        walkable.add(key);
        const prev = heightAt.get(key);
        if (prev == null || pad.z > prev) heightAt.set(key, pad.z);
      }
    }
  }
  return { walkable, heightAt };
}

function neighbors(ix: number, iy: number): Array<[number, number]> {
  return [
    [ix + 1, iy],
    [ix - 1, iy],
    [ix, iy + 1],
    [ix, iy - 1],
    [ix + 1, iy + 1],
    [ix - 1, iy - 1],
    [ix + 1, iy - 1],
    [ix - 1, iy + 1],
  ];
}

export function nearestWalkableCell(
  walkable: Set<string>,
  x: number,
  y: number
): { ix: number; iy: number } | null {
  const sx = Math.round(x / CELL);
  const sy = Math.round(y / CELL);
  if (walkable.has(cellKey(sx, sy))) return { ix: sx, iy: sy };
  let best: { ix: number; iy: number } | null = null;
  let bestD = Infinity;
  for (const key of walkable) {
    const [ix, iy] = key.split(':').map(Number);
    const d = (ix - sx) ** 2 + (iy - sy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { ix, iy };
    }
  }
  return best;
}

export function astarPadPath(
  walkable: Set<string>,
  from: NavPoint,
  to: NavPoint
): NavPoint[] {
  const start = nearestWalkableCell(walkable, from.x, from.y);
  const goal = nearestWalkableCell(walkable, to.x, to.y);
  if (!start || !goal) return [];
  const startKey = cellKey(start.ix, start.iy);
  const goalKey = cellKey(goal.ix, goal.iy);
  if (startKey === goalKey) return [{ x: to.x, y: to.y }];

  const open: Array<{ key: string; ix: number; iy: number; g: number; f: number }> = [
    { key: startKey, ix: start.ix, iy: start.iy, g: 0, f: 0 },
  ];
  const came = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const seen = new Set<string>();

  while (open.length && seen.size < MAX_NODES) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (seen.has(cur.key)) continue;
    seen.add(cur.key);
    if (cur.key === goalKey) break;
    for (const [nx, ny] of neighbors(cur.ix, cur.iy)) {
      const key = cellKey(nx, ny);
      if (!walkable.has(key)) continue;
      const step = nx !== cur.ix && ny !== cur.iy ? 1.4 : 1;
      const g = cur.g + step;
      if (g >= (gScore.get(key) ?? Infinity)) continue;
      came.set(key, cur.key);
      gScore.set(key, g);
      const h = Math.hypot(nx - goal.ix, ny - goal.iy);
      open.push({ key, ix: nx, iy: ny, g, f: g + h });
    }
  }

  if (!came.has(goalKey) && startKey !== goalKey) return [];
  const keys: string[] = [goalKey];
  let walk = goalKey;
  while (walk !== startKey) {
    const prev = came.get(walk);
    if (!prev) break;
    keys.push(prev);
    walk = prev;
  }
  keys.reverse();
  return keys.map((key) => {
    const [ix, iy] = key.split(':').map(Number);
    return { x: ix * CELL, y: iy * CELL };
  });
}

/** Next steering point along a path (skip the cell we are already on). */
export function nextNavWaypoint(path: NavPoint[], x: number, y: number): NavPoint | null {
  if (!path.length) return null;
  for (const p of path) {
    if (Math.hypot(p.x - x, p.y - y) > CELL * 0.65) return p;
  }
  return path[path.length - 1] ?? null;
}
