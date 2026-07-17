import { Container, Graphics, Text, TextStyle } from 'pixi.js';

/**
 * No art assets yet -- these are shared low-level `PIXI.Graphics` builders
 * used by both `entities/player-view.ts` and `entities/obstacle-view.ts` so
 * every placeholder shape stays visually consistent (same shadow, same
 * label style) until real sprite sheets replace them.
 */

export function createGroundShadow(radiusX: number, radiusY: number): Graphics {
  const shadow = new Graphics();
  shadow.ellipse(0, 0, radiusX, radiusY).fill({ color: 0x000000, alpha: 0.45 });
  return shadow;
}

export function createNameLabel(text: string): Text {
  const style = new TextStyle({
    fill: 0xffffff,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter, system-ui, sans-serif',
    stroke: { color: 0x000000, width: 3 },
  });
  const label = new Text({ text, style });
  label.anchor.set(0.5, 1);
  return label;
}

export function createHealthBar(width = 36, height = 5): { container: Container; fill: Graphics } {
  const container = new Container();
  const background = new Graphics();
  background.roundRect(-width / 2, 0, width, height, 2).fill({ color: 0x1a1a2e, alpha: 0.85 });

  const fill = new Graphics();
  fill.roundRect(-width / 2, 0, width, height, 2).fill({ color: 0x34d399 });

  container.addChild(background, fill);
  return { container, fill };
}

export function setHealthBarFill(fill: Graphics, ratio: number, width = 36, height = 5): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  const color = clamped > 0.5 ? 0x34d399 : clamped > 0.25 ? 0xfbbf24 : 0xef4444;
  fill.clear();
  fill.roundRect(-width / 2, 0, Math.max(2, width * clamped), height, 2).fill({ color });
}
