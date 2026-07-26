import type * as THREE from 'three';

/** Release the WebGL context so editor / match remounts don't black out avatars. */
export function disposeRendererHard(renderer: THREE.WebGLRenderer | null | undefined) {
  if (!renderer) return;
  try {
    renderer.dispose();
  } catch {
    /* ignore */
  }
  try {
    renderer.forceContextLoss();
  } catch {
    /* ignore — some platforms / OffscreenCanvas */
  }
}
