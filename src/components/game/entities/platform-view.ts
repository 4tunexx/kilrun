import { Container, Graphics } from 'pixi.js';
import type { NetPlatformState } from '../net/types';
import { depthZIndex, worldToScreen, type IsoCamera } from '../renderer/iso-camera';

const PLATFORM_TOP = 0xfbbf24;
const PLATFORM_SIDE = 0xb45309;
const PLATFORM_EDGE = 0xfef3c7;

/** Floating Deathrun platform pad — placeholder geometry until real models/textures arrive. */
export class PlatformView {
  public readonly container: Container;
  private mesh: Graphics;

  constructor() {
    this.container = new Container();
    this.mesh = new Graphics();
    this.container.addChild(this.mesh);
  }

  public update(
    platform: NetPlatformState,
    camera: IsoCamera,
    screenWidth: number,
    screenHeight: number
  ): void {
    const hw = platform.width / 2;
    const hd = platform.depth / 2;
    const z = platform.z;
    const thickness = 0.35;

    const cornersTop = [
      worldToScreen(platform.x - hw, platform.y - hd, camera, screenWidth, screenHeight, z),
      worldToScreen(platform.x + hw, platform.y - hd, camera, screenWidth, screenHeight, z),
      worldToScreen(platform.x + hw, platform.y + hd, camera, screenWidth, screenHeight, z),
      worldToScreen(platform.x - hw, platform.y + hd, camera, screenWidth, screenHeight, z),
    ];
    const cornersBot = [
      worldToScreen(platform.x - hw, platform.y - hd, camera, screenWidth, screenHeight, z - thickness),
      worldToScreen(platform.x + hw, platform.y - hd, camera, screenWidth, screenHeight, z - thickness),
      worldToScreen(platform.x + hw, platform.y + hd, camera, screenWidth, screenHeight, z - thickness),
      worldToScreen(platform.x - hw, platform.y + hd, camera, screenWidth, screenHeight, z - thickness),
    ];

    this.mesh.clear();
    // Side faces (simple extrusion look)
    this.mesh
      .poly([
        cornersTop[0].x,
        cornersTop[0].y,
        cornersTop[1].x,
        cornersTop[1].y,
        cornersBot[1].x,
        cornersBot[1].y,
        cornersBot[0].x,
        cornersBot[0].y,
      ])
      .fill({ color: PLATFORM_SIDE, alpha: 0.95 });
    this.mesh
      .poly([
        cornersTop[1].x,
        cornersTop[1].y,
        cornersTop[2].x,
        cornersTop[2].y,
        cornersBot[2].x,
        cornersBot[2].y,
        cornersBot[1].x,
        cornersBot[1].y,
      ])
      .fill({ color: PLATFORM_SIDE, alpha: 0.85 });
    // Top
    this.mesh
      .poly(cornersTop.flatMap((c) => [c.x, c.y]))
      .fill({ color: PLATFORM_TOP, alpha: 0.98 })
      .stroke({ color: PLATFORM_EDGE, width: 2, alpha: 0.7 });

    this.container.zIndex = depthZIndex(platform.x, platform.z) - 50;
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
