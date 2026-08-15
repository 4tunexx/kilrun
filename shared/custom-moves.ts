/**
 * Map-authored custom movement abilities (e.g. a back flip, a dash) —
 * player-defined via the Player Model Studio "Moves" tab, no code changes
 * needed per move. A single map can define several; only one can be
 * actively playing per player at a time (like attack/punch).
 *
 * Consumed by both the authoritative server sim (server/src/sim/movement.ts)
 * and Play Test's local sim (src/lib/platformer-sim.ts) so live matches and
 * Play Test behave identically.
 */

export interface CustomMoveDef {
  id: string;
  name: string;
  /** Single lowercase key character, e.g. "v", "g". */
  key: string;
  /** Clip name from the avatar's available clips (Player Model Studio). */
  clipName?: string;
  energyCost: number;
  durationMs: number;
  cooldownMs: number;
  /** Only usable while grounded. */
  groundedOnly: boolean;
  /** Vertical velocity applied on trigger (0 = no hop), grounded-only. */
  vzBoost: number;
  /** Sound event key (Sound Board) played once on trigger, if any. */
  soundEvent?: string;
  /** Icon shown on the HUD cooldown ring. */
  icon: string;
}

let counter = 0;
export function generateCustomMoveId(): string {
  counter += 1;
  return `move_${Date.now().toString(36)}_${counter}`;
}

export function defaultCustomMove(): CustomMoveDef {
  return {
    id: generateCustomMoveId(),
    name: 'New Move',
    key: 'g',
    clipName: undefined,
    energyCost: 15,
    durationMs: 600,
    cooldownMs: 1500,
    groundedOnly: true,
    vzBoost: 0,
    soundEvent: undefined,
    // "lucide:Name" — this platform renders lucide-react icons only, never
    // emoji. Kept as a plain string literal (not imported from
    // src/lib/move-icons.ts) since this file is shared with the server,
    // which must never import a client-only React icon library.
    icon: 'lucide:Sparkles',
  };
}

/** Reserved single-char keys already bound elsewhere — used to warn authors,
 * not to hard-block (a map author may still know what they're doing). */
export const RESERVED_MOVE_KEYS = new Set([
  'w', 'a', 's', 'd', 'e', 'r', 'c', 'q', 'z', 'x', 'h', 'u', 't', 'v',
  ' ', 'shift', 'control',
]);
