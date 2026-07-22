import * as THREE from 'three';
import type { EditorEntity, MapEnvironment } from './map-document';
import { ensureLight, ensurePushRail, ensureSpinHazard } from './map-document';

/** Sky preset hex colors — shared by editor, Play Test, and live match. */
export const MAP_SKY_COLORS: Record<string, string> = {
  cavern: '#0a1220',
  dusk: '#1a1530',
  bright: '#87b5e0',
  void: '#050508',
  custom: '#0a1220',
};

export function resolveSkyColor(env: MapEnvironment): string {
  if (env.sky === 'custom') return env.skyColor || '#0a1220';
  return MAP_SKY_COLORS[env.sky] ?? env.skyColor ?? '#0a1220';
}

export function resolveFogColor(env: MapEnvironment): string {
  return env.fogColor || env.horizonColor || resolveSkyColor(env);
}

/** Apply authored opacity to all mesh materials under a root. */
export function applyEntityOpacity(root: THREE.Object3D, opacity: number | undefined | null) {
  if (typeof opacity !== 'number' || Number.isNaN(opacity)) return;
  const o = Math.min(1, Math.max(0, opacity));
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m || !('opacity' in m)) continue;
      const mat = m as THREE.MeshStandardMaterial;
      mat.transparent = o < 0.999;
      mat.opacity = o;
      mat.needsUpdate = true;
    }
  });
}

export type AuthoredEnvLights = {
  ambient: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
};

export type ApplyAuthoredEnvironmentOpts = {
  lights?: AuthoredEnvLights;
  /** Optional ground mesh whose visibility/color/texture follow env.floor. */
  floorMesh?: THREE.Mesh;
  /** Optional grid helper shown when floor === 'grid'. */
  grid?: THREE.Object3D;
  /** Cap fog density (Play Test uses a lower cap for readability). */
  maxFogDensity?: number;
  /** When false, skip equirect sky texture (faster preview). Default true. */
  loadSkyTexture?: boolean;
};

/**
 * Apply map document environment (sky / fog / lights / floor) so Play Test
 * and live match match the editor viewport look.
 */
export function applyAuthoredEnvironment(
  scene: THREE.Scene,
  env: MapEnvironment,
  opts: ApplyAuthoredEnvironmentOpts = {}
): { dispose: () => void } {
  const skyHex = resolveSkyColor(env);
  const fogHex = resolveFogColor(env);
  const fogDensity = Math.min(
    env.fogDensity ?? 0.022,
    opts.maxFogDensity ?? Number.POSITIVE_INFINITY
  );

  let skyTexture: THREE.Texture | null = null;
  let cancelled = false;

  const setSolidSky = () => {
    scene.background = new THREE.Color(skyHex);
    scene.environment = null;
  };

  if (opts.loadSkyTexture !== false && env.skyTextureUrl) {
    new THREE.TextureLoader().load(
      env.skyTextureUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        skyTexture = tex;
        scene.background = tex;
        scene.environment = tex;
      },
      undefined,
      () => {
        if (!cancelled) setSolidSky();
      }
    );
  } else {
    setSolidSky();
  }

  scene.fog = new THREE.FogExp2(fogHex, Number.isFinite(fogDensity) ? fogDensity : 0.022);

  if (opts.lights) {
    const { ambient, sun, hemi } = opts.lights;
    ambient.intensity = env.ambientIntensity ?? 0.55;
    sun.intensity = env.sunIntensity ?? 1.15;
    if (env.sunColor) sun.color.set(env.sunColor);
    else sun.color.set(0xfff2d6);
    hemi.intensity = Math.max(0.2, (env.ambientIntensity ?? 0.55) * 0.85);
    if (env.horizonColor) hemi.groundColor.set(env.horizonColor);
  }

  if (opts.grid) {
    opts.grid.visible = env.floor === 'grid';
  }

  if (opts.floorMesh) {
    const floor = opts.floorMesh;
    floor.visible = env.floor !== 'void';
    const mat = floor.material as THREE.MeshStandardMaterial;
    if (env.floor === 'water') {
      mat.color.set('#0e4a6e');
      mat.transparent = true;
      mat.opacity = 0.75;
      mat.metalness = 0.4;
      mat.roughness = 0.2;
    } else {
      mat.color.set(env.floorColor || '#1a2740');
      mat.transparent = false;
      mat.opacity = 1;
      mat.metalness = 0;
      mat.roughness = 1;
    }
    const tile = Math.max(1, env.floorTextureScale ?? 40);
    if (env.defaultTextureUrl) {
      new THREE.TextureLoader().load(env.defaultTextureUrl, (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(tile, tile);
        if (mat.map && mat.map !== tex) mat.map.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
      });
    } else if (mat.map) {
      mat.map.dispose();
      mat.map = null;
      mat.needsUpdate = true;
    }
  }

  return {
    dispose: () => {
      cancelled = true;
      if (skyTexture) {
        skyTexture.dispose();
        skyTexture = null;
      }
    },
  };
}

/** Authored map light — point / spot / flashlight / beam. */
export function makeAuthoredLight(ent: EditorEntity): THREE.Group {
  const cfg = ensureLight(ent);
  const group = new THREE.Group();
  group.name = 'map-light';
  const type = cfg.type ?? 'point';
  const bulb = new THREE.Mesh(
    type === 'beam'
      ? new THREE.CylinderGeometry(0.07, 0.12, 0.3, 10)
      : new THREE.SphereGeometry(0.16, 14, 10),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color),
      emissive: new THREE.Color(cfg.color),
      emissiveIntensity: 1.1,
    })
  );
  if (type === 'spot' || type === 'flashlight' || type === 'beam') {
    const angle = THREE.MathUtils.degToRad(cfg.angleDeg ?? (type === 'beam' ? 12 : 40));
    const spot = new THREE.SpotLight(
      new THREE.Color(cfg.color),
      cfg.intensity,
      cfg.beamLength ?? cfg.distance,
      angle,
      cfg.penumbra ?? 0.35,
      1.5
    );
    spot.castShadow = !!cfg.castShadow;
    const target = new THREE.Object3D();
    const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg ?? (type === 'flashlight' ? -8 : -25));
    target.position.set(0, Math.sin(pitch) * 4, Math.cos(pitch) * 4);
    group.add(target);
    spot.target = target;
    group.add(bulb);
    group.add(spot);
  } else {
    const point = new THREE.PointLight(new THREE.Color(cfg.color), cfg.intensity, cfg.distance, 2);
    point.castShadow = !!cfg.castShadow;
    group.add(bulb);
    group.add(point);
  }
  group.position.set(...ent.position);
  group.userData.entityId = ent.id;
  return group;
}

/** Gameplay placeholder when a marker has no GLB (Play Test + live overlay). */
export function makeGameplayFallback(ent: EditorEntity): THREE.Object3D | null {
  if (ent.kind === 'button') {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
    );
    btn.position.y = 0.1;
    return btn;
  }
  if (ent.kind === 'hazard' || ent.kind === 'trap' || ent.kind === 'red_zone') {
    const hazard = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.12, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.55,
        emissive: 0xaa0000,
        emissiveIntensity: 0.35,
      })
    );
    hazard.position.y = 0.06;
    return hazard;
  }
  if (ent.kind === 'finish') {
    const finish = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.35,
      })
    );
    finish.position.y = 0.06;
    return finish;
  }
  if (ent.kind === 'jump_pad' || ent.jumpPad?.enabled) {
    const jump = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.12, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0369a1,
        emissiveIntensity: 0.45,
      })
    );
    jump.position.y = 0.06;
    return jump;
  }
  if (ent.kind === 'health_floor') {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x059669,
        emissiveIntensity: 0.4,
      })
    );
    pad.position.y = 0.06;
    return pad;
  }
  if (ent.kind === 'revive_pad') {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x2563eb,
        emissiveIntensity: 0.4,
      })
    );
    pad.position.y = 0.06;
    return pad;
  }
  if (ent.kind === 'door') {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xa78bfa })
    );
  }
  if (ent.kind === 'spinner') {
    const spin = ensureSpinHazard(ent);
    const [w, h, d] = spin.size;
    let geo: THREE.BufferGeometry;
    switch (spin.shape) {
      case 'disc':
        geo = new THREE.CylinderGeometry(Math.max(w, d) * 0.5, Math.max(w, d) * 0.5, Math.max(0.08, h), 24);
        break;
      case 'cross': {
        const g = new THREE.BoxGeometry(w, h, d * 0.35);
        return (() => {
          const group = new THREE.Group();
          const a = new THREE.Mesh(
            g,
            new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.4, roughness: 0.35 })
          );
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(d * 0.35, h, w),
            new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.4, roughness: 0.35 })
          );
          a.position.y = h * 0.5;
          b.position.y = h * 0.5;
          group.add(a, b);
          group.userData.spinHazard = true;
          return group;
        })();
      }
      case 'bar':
        geo = new THREE.BoxGeometry(w, h, d);
        break;
      case 'box':
        geo = new THREE.BoxGeometry(w, h, d);
        break;
      case 'blade':
      default:
        geo = new THREE.BoxGeometry(w, h, d);
        break;
    }
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.45, roughness: 0.3 })
    );
    mesh.position.y = h * 0.5;
    mesh.userData.spinHazard = true;
    return mesh;
  }
  if (ent.kind === 'push_rail') {
    const rail = ensurePushRail(ent);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(rail.width, 0.08, rail.length),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        emissive: 0x0284c7,
        emissiveIntensity: 0.3,
      })
    );
    mesh.position.y = 0.04;
    return mesh;
  }
  if (ent.kind === 'push_block') {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.2, roughness: 0.55 })
    );
  }
  return null;
}

export function shouldUseGameplayFallback(
  ent: EditorEntity,
  reason: 'missing-model' | 'load-failed'
): boolean {
  if (ent.kind === 'button' || ent.kind === 'hazard' || ent.kind === 'finish') return true;
  if (ent.kind === 'jump_pad' || ent.jumpPad?.enabled) return true;
  if (ent.kind === 'red_zone' || ent.kind === 'revive_pad' || ent.kind === 'health_floor') {
    return true;
  }
  if (ent.kind === 'door' || ent.kind === 'spinner' || ent.kind === 'push_rail' || ent.kind === 'push_block') {
    return true;
  }
  if (reason === 'load-failed') {
    return ent.kind === 'prop' || ent.kind === 'trap';
  }
  return false;
}
