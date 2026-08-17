import * as THREE from 'three';
import type { EditorEntity, MapEnvironment, EntityGlow } from './map-document';
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
    if (child.name === '__glow_halo__') return;
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

const GLOW_HALO_NAME = '__glow_halo__';
const GLOW_LIGHT_NAME = '__glow_point_light__';

function clampGlow(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Surface emissive from Brightness slider. Linear — no cliff past 1.0. */
export function glowSurfaceEmissive(brightness?: number): number {
  const v = typeof brightness === 'number' && Number.isFinite(brightness) ? brightness : 1;
  return clampGlow(v, 0.05, 3) * 0.42;
}

/** Halo amount from Glow Intensity slider (0 = mesh only, 1 = full bloom). */
export function glowBloomAmount(bloom?: number): number {
  const v = typeof bloom === 'number' && Number.isFinite(bloom) ? bloom : 0.35;
  return clampGlow(v, 0, 1);
}

function stripGlowHalos(root: THREE.Object3D) {
  const remove: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.name === GLOW_HALO_NAME) remove.push(child);
  });
  for (const halo of remove) {
    halo.removeFromParent();
    if (halo instanceof THREE.Mesh) {
      halo.geometry.dispose();
      const mat = halo.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  }
}

/**
 * Make a surface self-lit (emissive). Soft bleed comes from the bloom pass
 * in the editor / Play Test / live renderer — extra mesh copies always look
 * like glass boxes on doorways.
 */
export function applyEntityGlow(
  root: THREE.Object3D,
  glow: EntityGlow | undefined,
  fallbackColor?: string
) {
  const isGlowing = glow?.enabled === true;
  const glowHex = glow?.color || fallbackColor || '#00f0ff';
  const glowColor = new THREE.Color(glowHex);
  const surface = glowSurfaceEmissive(glow?.intensity);
  const bloomAmt = isGlowing ? glowBloomAmount(glow?.bloom) : 0;

  stripGlowHalos(root);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return;
    if (child.name === GLOW_HALO_NAME) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m || !('emissive' in m)) continue;
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat.userData.__origEmissive) {
        mat.userData.__origEmissive = mat.emissive.clone();
        mat.userData.__origEmissiveIntensity = mat.emissiveIntensity;
        if ('color' in mat && mat.color) mat.userData.__origColor = mat.color.clone();
        if ('roughness' in mat) mat.userData.__origRoughness = mat.roughness;
        mat.userData.__origToneMapped = mat.toneMapped;
      }
      if (isGlowing) {
        child.userData.bloom = bloomAmt > 0.01;
        child.userData.bloomStrength = bloomAmt;
        child.userData.bloomColor = glowHex;
        mat.emissive.copy(glowColor);
        mat.emissiveIntensity = surface;
        mat.toneMapped = true;
        if ('color' in mat && mat.color) {
          const orig = mat.userData.__origColor as THREE.Color | undefined;
          if (orig) mat.color.copy(orig).lerp(glowColor, 0.28);
          else mat.color.copy(glowColor).multiplyScalar(0.65);
        }
        if ('roughness' in mat) mat.roughness = Math.min(mat.roughness, 0.45);
      } else {
        child.userData.bloom = false;
        child.userData.bloomStrength = 0;
        child.userData.bloomColor = undefined;
        if (mat.userData.__origEmissive) {
          mat.emissive.copy(mat.userData.__origEmissive);
          mat.emissiveIntensity = mat.userData.__origEmissiveIntensity ?? 0;
        } else {
          mat.emissive.set(0x000000);
          mat.emissiveIntensity = 0;
        }
        if (mat.userData.__origColor) mat.color.copy(mat.userData.__origColor);
        if (typeof mat.userData.__origRoughness === 'number') {
          mat.roughness = mat.userData.__origRoughness;
        }
        if (typeof mat.userData.__origToneMapped === 'boolean') {
          mat.toneMapped = mat.userData.__origToneMapped;
        } else {
          mat.toneMapped = true;
        }
      }
      mat.needsUpdate = true;
    }
  });

  const existingLight = root.getObjectByName(GLOW_LIGHT_NAME) as THREE.PointLight | null;
  if (isGlowing && glow?.castLight) {
    const lightDist = glow.lightDistance ?? 6;
    const lightInt = glow.lightIntensity ?? 1.0;
    if (existingLight) {
      existingLight.color.copy(glowColor);
      existingLight.distance = lightDist;
      existingLight.intensity = lightInt;
    } else {
      const pLight = new THREE.PointLight(glowColor, lightInt, lightDist);
      pLight.name = GLOW_LIGHT_NAME;
      pLight.position.set(0, 0.5, 0);
      root.add(pLight);
    }
  } else if (existingLight) {
    existingLight.removeFromParent();
    existingLight.dispose();
  }
}

/**
 * Animate dynamic glow pulse / breathe / flicker / flash each frame.
 */
export function tickEntityGlow(
  root: THREE.Object3D,
  glow: EntityGlow | undefined,
  elapsedMs: number
) {
  if (!glow?.enabled || !glow.pulse || glow.pulse === 'none') return;
  const minFactor = Math.max(0, Math.min(1, glow.pulseMin ?? 0.25));
  const hz = Math.max(0.1, glow.pulseSpeed ?? 1.0);
  const t = (elapsedMs / 1000) * hz * Math.PI * 2;

  let factor = 1.0;
  switch (glow.pulse) {
    case 'breathe': {
      // Smooth sinusoidal glow
      factor = minFactor + (1 - minFactor) * (0.5 + 0.5 * Math.sin(t));
      break;
    }
    case 'pulse': {
      // Sharp heartbeat pulse
      const s = Math.sin(t);
      factor = minFactor + (1 - minFactor) * Math.pow(Math.max(0, s), 3);
      break;
    }
    case 'flicker': {
      // Neon sign electric buzzing flicker
      const noise =
        Math.sin(t * 1.7) * 0.25 +
        Math.sin(t * 3.3) * 0.2 +
        Math.sin(t * 7.1) * 0.15;
      const glitch = Math.sin(t * 11) > 0.82 ? -0.4 : 0.05;
      factor = Math.max(minFactor, Math.min(1.2, 0.75 + noise + glitch));
      break;
    }
    case 'flash': {
      // Strobe / warning flash
      factor = Math.sin(t) > 0.2 ? 1.0 : minFactor;
      break;
    }
  }

  const currentIntensity = glowSurfaceEmissive(glow.intensity) * factor;
  const bloomAmt = glowBloomAmount(glow.bloom) * factor;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return;
    if (child.name === GLOW_HALO_NAME) return;
    child.userData.bloom = bloomAmt > 0.01;
    child.userData.bloomStrength = bloomAmt;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m || !('emissiveIntensity' in m)) continue;
      (m as THREE.MeshStandardMaterial).emissiveIntensity = currentIntensity;
    }
  });

  const pLight = root.getObjectByName(GLOW_LIGHT_NAME) as THREE.PointLight | null;
  if (pLight) {
    pLight.intensity = (glow.lightIntensity ?? 1.0) * factor;
  }
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

/** Radial gradient used by the void shadow halo planes. */
function makeVoidShadowTexture(): THREE.CanvasTexture {
  const size = 512;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d')!;
  const grd = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.02,
    size / 2,
    size / 2,
    size * 0.5
  );
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Apply map document environment (sky / fog / lights / floor) so Play Test
 * and live match match the editor viewport look. Includes the void preset
 * overrides (void fog / sky tint / floor tint / glowing shadow halo) so
 * World-tab void settings behave identically in every mode.
 */
export function applyAuthoredEnvironment(
  scene: THREE.Scene,
  env: MapEnvironment,
  opts: ApplyAuthoredEnvironmentOpts = {}
): { dispose: () => void } {
  const isVoid = env.floor === 'void';
  const skyHex = resolveSkyColor(env);
  // Void maps: void-specific fog override (density & color) so the abyss keeps
  // its authored glow. Falls back to global fog settings when unset.
  const fogHex = isVoid && env.voidFogColor ? env.voidFogColor : resolveFogColor(env);
  const fogDensity = Math.min(
    isVoid && env.voidFogDensity != null ? env.voidFogDensity : env.fogDensity ?? 0.022,
    opts.maxFogDensity ?? Number.POSITIVE_INFINITY
  );
  const safeFogDensity = Number.isFinite(fogDensity)
    ? Math.max(0, Math.min(0.2, fogDensity))
    : 0.022;
  // Void maps tint the solid sky towards the void color so the horizon matches
  // the abyss below (never overrides an authored sky texture).
  const solidSkyHex = isVoid && env.voidColor && !env.skyTextureUrl ? env.voidColor : skyHex;

  let skyTexture: THREE.Texture | null = null;
  let cancelled = false;
  const disposables: Array<{ dispose: () => void }> = [];
  const spawnedMeshes: THREE.Object3D[] = [];

  const setSolidSky = () => {
    scene.background = new THREE.Color(solidSkyHex);
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

  scene.fog = new THREE.FogExp2(fogHex, safeFogDensity);

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
    // Void floor tint: when authored, render the floor plane as a translucent
    // colored disc instead of hiding it entirely (matches editor viewport).
    const legacyVoidTint = Boolean(env.voidColor);
    const voidFloorColor = env.voidFloorColor ?? env.voidColor ?? '#050810';
    const voidFloorOpacity = env.voidFloorOpacity ?? (legacyVoidTint ? 0.92 : 1);
    const showVoidFloor =
      isVoid &&
      (env.voidFloorColor != null || env.voidColor != null || voidFloorOpacity > 0.01);
    floor.visible = !isVoid || showVoidFloor;
    const mat = floor.material as THREE.MeshStandardMaterial;
    if (env.floor === 'water') {
      mat.color.set('#0e4a6e');
      mat.transparent = true;
      mat.opacity = 0.75;
      mat.metalness = 0.4;
      mat.roughness = 0.2;
    } else if (isVoid && showVoidFloor) {
      mat.color.set(voidFloorColor);
      mat.transparent = voidFloorOpacity < 0.999;
      mat.opacity = Math.max(0, Math.min(1, voidFloorOpacity));
      mat.metalness = 0.08;
      mat.roughness = 0.95;
    } else if (isVoid) {
      mat.color.set('#000000');
      mat.transparent = true;
      mat.opacity = 0;
      mat.metalness = 0;
      mat.roughness = 1;
    } else {
      mat.color.set(env.floorColor || '#1a2740');
      mat.transparent = false;
      mat.opacity = 1;
      mat.metalness = 0;
      mat.roughness = 1;
    }
    const tile = Math.max(1, env.floorTextureScale ?? 40);
    if (!isVoid && env.defaultTextureUrl) {
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

  // Void shadow / glowing fog halo under the platforms (two-stage additive
  // radial glow) — same construction as the editor viewport.
  const shadowIntensity = isVoid ? Math.max(0, Math.min(2, env.voidShadowIntensity ?? 0)) : 0;
  if (shadowIntensity > 0) {
    const voidFloorColorForShadow = env.voidFloorColor ?? env.voidColor ?? '#050810';
    const shadowColor = env.voidShadowColor ?? env.voidFogColor ?? voidFloorColorForShadow;
    const voidShadowTex = makeVoidShadowTexture();
    disposables.push(voidShadowTex);

    const voidShadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(shadowColor),
      transparent: true,
      opacity: 0.9 * shadowIntensity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: voidShadowTex,
    });
    disposables.push(voidShadowMat);
    const voidShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), voidShadowMat);
    disposables.push(voidShadowMesh.geometry);
    voidShadowMesh.rotation.x = -Math.PI / 2;
    voidShadowMesh.position.y = -0.012;
    voidShadowMesh.renderOrder = 1;
    scene.add(voidShadowMesh);
    spawnedMeshes.push(voidShadowMesh);

    // Inner halo uses a slightly brighter shade — feels more volumetric right
    // under the platforms.
    const brighter = new THREE.Color(shadowColor).offsetHSL(0, 0, 0.06);
    const voidShadowInnerMat = new THREE.MeshBasicMaterial({
      color: brighter,
      transparent: true,
      opacity: 0.55 * shadowIntensity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: voidShadowTex,
    });
    disposables.push(voidShadowInnerMat);
    const voidShadowInner = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), voidShadowInnerMat);
    disposables.push(voidShadowInner.geometry);
    voidShadowInner.rotation.x = -Math.PI / 2;
    voidShadowInner.position.y = -0.008;
    voidShadowInner.renderOrder = 2;
    scene.add(voidShadowInner);
    spawnedMeshes.push(voidShadowInner);

    // Expand shadow halo radius for denser void fog (bigger perceived abyss).
    const scale = 0.85 + Math.min(1.6, safeFogDensity * 18);
    voidShadowMesh.scale.setScalar(scale);
    voidShadowInner.scale.setScalar(scale);
  }

  return {
    dispose: () => {
      cancelled = true;
      if (skyTexture) {
        skyTexture.dispose();
        skyTexture = null;
      }
      for (const mesh of spawnedMeshes) scene.remove(mesh);
      for (const d of disposables) d.dispose();
    },
  };
}

/** Authored map light — point / spot / flashlight / beam. */
export function makeAuthoredLight(ent: EditorEntity): THREE.Group {
  const cfg = ensureLight(ent);
  const group = new THREE.Group();
  group.name = 'map-light';
  const type = cfg.type ?? 'point';
  // Off by default: a light is meant to illuminate, not appear as a visible
  // prop. Only add the fixture mesh when the author explicitly opts in.
  const bulb = cfg.showFixture
    ? new THREE.Mesh(
        type === 'beam'
          ? new THREE.CylinderGeometry(0.07, 0.12, 0.3, 10)
          : new THREE.SphereGeometry(0.16, 14, 10),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(cfg.color),
          emissive: new THREE.Color(cfg.color),
          emissiveIntensity: 1.1,
        })
      )
    : null;
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
    if (bulb) group.add(bulb);
    group.add(spot);
  } else {
    const point = new THREE.PointLight(new THREE.Color(cfg.color), cfg.intensity, cfg.distance, 2);
    point.castShadow = !!cfg.castShadow;
    if (bulb) group.add(bulb);
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
  // An entity authored as solid collision must NEVER end up invisible,
  // regardless of kind or why its mesh didn't render (missing model field vs.
  // a GLB fetch that 404'd). entityExportsAsPlatform / mapDocToSimPlatforms
  // don't require a model to produce a real collider, so a modelless "solid"
  // prop was previously falling through to `return false` here — invisible
  // AND fully solid, i.e. exactly the "stuck on an invisible block" bug.
  if (ent.collideMaterial === 'solid' || ent.solid === true) return true;
  if (reason === 'load-failed') {
    return ent.kind === 'prop' || ent.kind === 'trap';
  }
  return false;
}

/** Rotate a spinner (or prop with spinHazard) around its authored axis. */
export function tickSpinHazardVisual(root: THREE.Object3D, ent: EditorEntity, dt: number) {
  if (ent.kind !== 'spinner' && !ent.spinHazard?.enabled) return;
  const spin = ensureSpinHazard(ent);
  if (spin.enabled === false || Math.abs(spin.speed) < 1e-6) return;
  let target: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!target && o.userData?.spinHazard) target = o;
  });
  const obj = target ?? root.children[0] ?? root;
  const rad = spin.speed * Math.PI * 2 * dt;
  if (spin.axis === 'x') obj.rotateX(rad);
  else if (spin.axis === 'z') obj.rotateZ(rad);
  else obj.rotateY(rad);
}
