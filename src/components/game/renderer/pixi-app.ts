import { Application, Container } from 'pixi.js';

export interface PixiBootstrap {
  app: Application;
  worldLayer: Container;
  destroy: () => void;
}

/**
 * Boots a PixiJS Application into `hostElement`, sized to fill it and
 * kept in sync on resize. `worldLayer` is a depth-sortable container that
 * every game entity (players, obstacles, track) gets added to; UI overlays
 * (HUD/crosshair) are rendered separately in React, not in Pixi.
 */
export async function createPixiApp(hostElement: HTMLDivElement): Promise<PixiBootstrap> {
  const app = new Application();
  await app.init({
    resizeTo: hostElement,
    backgroundColor: 0x05070f,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  hostElement.appendChild(app.canvas);

  const worldLayer = new Container();
  worldLayer.sortableChildren = true;
  app.stage.addChild(worldLayer);

  const destroy = () => {
    app.destroy(true, { children: true, texture: true });
  };

  return { app, worldLayer, destroy };
}
