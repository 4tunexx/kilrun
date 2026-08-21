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
  | 'pause'
  | 'scoreboard'
  | 'freeMouse'
  | 'aim'
  | 'power_hook'
  | 'power_berserk'
  | 'power_bullet'
  | 'power_thunder'
  | 'power_visibility'
  | 'power_fly'
  | 'power_backflip';

export type KeyBindGroup = 'Movement' | 'Actions' | 'Interface' | 'Powers';

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
  pause: 'escape',
  scoreboard: '`',
  freeMouse: 'tab',
  aim: 'mouse2',
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
  { action: 'pause', label: 'Pause / Menu', group: 'Interface' },
  { action: 'scoreboard', label: 'Scoreboard (hold)', group: 'Interface' },
  { action: 'freeMouse', label: 'Free mouse cursor', group: 'Interface' },
  { action: 'aim', label: 'Aim (hold)', group: 'Interface' },
  { action: 'power_hook', label: 'Power: Grapple Hook', group: 'Powers' },
  { action: 'power_berserk', label: 'Power: Berserk', group: 'Powers' },
  { action: 'power_bullet', label: 'Power: Unlimited Ammo', group: 'Powers' },
  { action: 'power_thunder', label: 'Power: Thunder Bolt', group: 'Powers' },
  { action: 'power_visibility', label: 'Power: Invisibility', group: 'Powers' },
  { action: 'power_fly', label: 'Power: Fly', group: 'Powers' },
  { action: 'power_backflip', label: 'Power: Backflip (dash)', group: 'Powers' },
];

export function canonicalBindKey(key: string): string {
  if (typeof key !== 'string') return '';
  if (key === ' ' || key.trim().toLowerCase() === 'space') return ' ';
  const k = key.trim().toLowerCase();
  if (k === 'rmb' || k === 'mouse2') return 'mouse2';
  if (k === 'lmb' || k === 'mouse0') return 'mouse0';
  if (k === 'mmb' || k === 'middle' || k === 'mouse1') return 'mouse1';
  if (k === 'esc') return 'escape';
  if (k === 'ctrl') return 'control';
  if (k === 'backquote' || k === 'grave') return '`';
  return k;
}

export function mouseButtonFromBind(bind: string): number | null {
  const k = canonicalBindKey(bind);
  if (k === 'mouse0') return 0;
  if (k === 'mouse1') return 1;
  if (k === 'mouse2') return 2;
  return null;
}

/**
 * A key is only bindable if `keyBindToCodes` (below) can actually resolve
 * it to a `KeyboardEvent.code` — a-z, 0-9, space, shift, control, escape,
 * tab, backtick — or it is a mouse button (mouse0/1/2). Anything else
 * (arrows, function keys, Home/End, …) used to be accepted here and saved
 * successfully, but every consumer only ever checks `keyBindToCodes`, which
 * silently returns `false` for an unresolvable key.
 */
export function isValidBindKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  const k = canonicalBindKey(key);
  if (mouseButtonFromBind(k) != null) return true;
  if (k === ' ') return true;
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
      result[meta.action] = canonicalBindKey(raw);
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
  if (k === 'control' || k === 'ctrl') return ['ControlLeft', 'ControlRight'];
  if (k === 'escape' || k === 'esc') return ['Escape'];
  if (k === 'tab') return ['Tab'];
  if (k === '`' || k === 'backquote' || k === 'grave') return ['Backquote'];
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
  const k = canonicalBindKey(key);
  if (!k) return [];
  return KEY_BIND_ACTIONS.filter(
    (meta) => meta.action !== ignoreAction && canonicalBindKey(bindings[meta.action]) === k
  );
}

/** HUD / pause labels for a stored bind (` `, `shift`, `r`). */
export function formatBindKey(key: string): string {
  if (key === ' ') return 'Space';
  const k = key.trim().toLowerCase();
  if (k === 'shift') return 'Shift';
  if (k === 'control' || k === 'ctrl') return 'Ctrl';
  if (k === 'alt') return 'Alt';
  if (k === 'escape' || k === 'esc') return 'Esc';
  if (k === 'tab') return 'Tab';
  if (k === '`' || k === 'backquote' || k === 'grave') return '`';
  if (k === 'mouse2' || k === 'rmb') return 'RMB';
  if (k === 'mouse0' || k === 'lmb') return 'LMB';
  if (k === 'mouse1' || k === 'mmb' || k === 'middle') return 'MMB';
  if (k.length === 1) return k.toUpperCase();
  return key;
}

export function eventMatchesBind(e: { code: string }, bind: string): boolean {
  return keyBindToCodes(bind).includes(e.code);
}

export function eventMatchesMouseBind(button: number, bind: string): boolean {
  return mouseButtonFromBind(bind) === button;
}
