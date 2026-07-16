
export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface GameSettings {
  sensitivity: number;
  fov: number;
  mobileSensitivity: number;
  smoothing: boolean;
}

export interface GameState {
  score: number;
  distance: number;
  health: number;
  status: 'playing' | 'gameover' | 'paused';
  speed: number;
  combo: number;
  maxCombo: number;
  checkpointZ: number;
}

export interface ObstacleData {
  id: string;
  type: 'static' | 'moving' | 'laser' | 'crusher' | 'spike';
  position: Vector3;
  size: Vector3;
  color: string;
  hit: boolean;
  active?: boolean;
}

export interface Particle {
  position: Vector3;
  velocity: Vector3;
  life: number;
  maxLife: number;
  color: string;
}
