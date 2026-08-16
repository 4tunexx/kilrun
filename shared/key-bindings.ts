/**
 * Single source of truth for every rebindable keyboard action — movement,
 * core actions, and the 7 skill-tree power activations. Framework-agnostic
 * (no React/Prisma imports) so it's safe to import from the client (Input
 * Manager, Controls panel, custom-move conflict checks) and, in principle,
 * the server (nothing here touches gameplay logic, just key identity).
 *
 * Global and admin-configured (stored on the SiteSettings singleton via
 * src/lib/key-bindings-config.ts) — applies to every map, live matches, and
 * Play Test alike. Map-authored custom moves (shared/custom-moves.ts) are a
 * separate, per-map concept but share this same key-conflict surface.
 */

export type KeyBindAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'slide'
  | 'interact'
  | 'reload'
  | 'flip'
  | 'cameraTurnLeft'
  | 'power_hook'
  | 'power_berserk'
  | 'power_bullet'
  | 'power_thunder'
  | 'power_visibility'
  | 'power_fly'
  | 'power_backflip';

export type KeyBindGroup = 'Movement' | 'Actions' | 'Powers';

export interface KeyBindActionMeta {
  action: KeyBindAction;
  label: string;
  group: KeyBindGroup;
}

/**
 * Defaults. Backflip (the power, burst-dash) keeps its documented Q
 * binding — cameraTurnLeft (an undocumented, keyboard-only camera-turn
 * fallback with no matching "turn right" key) moved off Q to make room:
 * the two were previously both bound to 'q' and fired simultaneously any
 * time a Backflip-unlocked player pressed it, which is a real, user-visible
 * bug (unwanted energy spend / dash on every camera nudge).
 */
export const DEFAULT_KEY_BINDINGS: Record<KeyBindAction, string> = {
  moveForward: 'w',
  moveBack: 's',
  moveLeft: 'a',
  moveRight: 'd',
  jump: ' ',
  sprint: 'shift',
  crouch: 'c',
  slide: 'g',
  interact: 'e',
  reload: 'r',
  flip: 'v',
  cameraTurnLeft: 'j',
  power_hook: 'h',
  power_berserk: 'b',
  power_bullet: 'u',
  power_thunder: 't',
  power_visibility: 'z',
  power_fly: 'x',
  power_backflip: 'q',
};

export const KEY_BIND_ACTIONS: KeyBindActionMeta[] = [
  { action: 'moveForward', label: 'Move Forward', group: 'Movement' },
  { action: 'moveBack', label: 'Move Back', group: 'Movement' },
  { action: 'moveLeft', label: 'Move Left', group: 'Movement' },
  { action: 'moveRight', label: 'Move Right', group: 'Movement' },
  { action: 'jump', label: 'Jump', group: 'Actions' },
  { action: 'sprint', label: 'Sprint', group: 'Actions' },
  { action: 'crouch', label: 'Crouch', group: 'Actions' },
  { action: 'slide', label: 'Slide (hold Sprint + press)', group: 'Actions' },
  { action: 'interact', label: 'Interact', group: 'Actions' },
  { action: 'reload', label: 'Reload', group: 'Actions' },
  { action: 'flip', label: 'Back Flip (free move)', group: 'Actions' },
  { action: 'cameraTurnLeft', label: 'Camera Turn Left (accessibility)', group: 'Actions' },
  { action: 'power_hook', label: 'Power: Grapple Hook', group: 'Powers' },
  { action: 'power_berserk', label: 'Power: Berserk', group: 'Powers' },
  { action: 'power_bullet', label: 'Power: Unlimited Ammo', group: 'Powers' },
  { action: 'power_thunder', label: 'Power: Thunder Bolt', group: 'Powers' },
  { action: 'power_visibility', label: 'Power: Invisibility', group: 'Powers' },
  { action: 'power_fly', label: 'Power: Fly', group: 'Powers' },
  { action: 'power_backflip', label: 'Power: Backflip (dash)', group: 'Powers' },
];

/**
 * A key is only bindable if `keyBindToCodes` (below) can actually resolve
 * it to a `KeyboardEvent.code` — a-z, 0-9, space, shift, control. Anything
 * else (arrows, function keys, Home/End, …) used to be accepted here and
 * saved successfully, but every consumer (map-play-preview.tsx's Play Test)
 * only ever checks `keyBindToCodes(...).some(...)`, which silently returns
 * `false` for an unresolvable key — so the rebind "succeeded" but the
 * action then never fired again, with no error surfaced anywhere.
 */
export function isValidBindKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  if (key === ' ') return true;
  const k = key.trim().toLowerCase();
  return keyBindToCodes(k).length > 0;
}

export function normalizeBindings(
  input: Partial<Record<string, unknown>> | null | undefined
): Record<KeyBindAction, string> {
  const result = { ...DEFAULT_KEY_BINDINGS };
  if (!input) return result;
  for (const meta of KEY_BIND_ACTIONS) {
    const raw = input[meta.action];
    if (typeof raw === 'string' && isValidBindKey(raw)) {
      result[meta.action] = raw === ' ' ? ' ' : raw.trim().toLowerCase();
    }
  }
  return result;
}

/**
 * Maps a bound lowercase key value (as stored in DEFAULT_KEY_BINDINGS /
 * CustomMoveDef.key — a plain char like "v", or "shift"/"control"/" ") to
 * the matching `KeyboardEvent.code`(s). Play Test tracks physical `e.code`
 * (KeyV, ShiftLeft…) while KeyboardHandler tracks logical `e.key.toLowerCase()`
 * — this bridges a bound value into the `code` convention for callers that
 * need it (map-play-preview.tsx). Modifier keys resolve to both left/right
 * variants since either should count as "pressed".
 */
export function keyBindToCodes(key: string): string[] {
  if (typeof key !== 'string') return [];
  if (key === ' ' || key.trim().toLowerCase() === 'space') return ['Space'];
  const k = key.trim().toLowerCase();
  if (k === 'shift') return ['ShiftLeft', 'ShiftRight'];
  if (k === 'control') return ['ControlLeft', 'ControlRight'];
  if (/^[0-9]$/.test(k)) return [`Digit${k}`];
  if (/^[a-z]$/.test(k)) return [`Key${k.toUpperCase()}`];
  return [];
}

/** Actions (with labels) currently sharing the given key — for live conflict UI. */
export function findConflicts(
  bindings: Record<KeyBindAction, string>,
  key: string,
  ignoreAction?: KeyBindAction
): KeyBindActionMeta[] {
  const k = key.trim().toLowerCase();
  if (!k) return [];
  return KEY_BIND_ACTIONS.filter(
    (meta) => meta.action !== ignoreAction && bindings[meta.action] === k
  );
}
