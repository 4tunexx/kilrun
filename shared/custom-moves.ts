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

import { DEFAULT_KEY_BINDINGS } from './key-bindings';

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
    // "lucide:Name" — this platform renders lucide-react icons only, never
    // emoji. Kept as a plain string literal (not imported from
    // src/lib/move-icons.ts) since this file is shared with the server,
    // which must never import a client-only React icon library.
    icon: 'lucide:Sparkles',
  };
}

/** Sound Board event key for a custom move's trigger sound — every move
 * gets one automatically (no per-move opt-in/typing a matching key needed),
 * mirroring how every custom move already auto-creates its own
 * PowerDefinition ("custom_move_<id>", see player-model-studio.tsx's
 * scheduleMovePowerSync). The Sound Board panel lists one row per move
 * across every map under a "Custom Moves" category so an admin can bind a
 * clip immediately — silent (no-op) until one is uploaded. */
export function customMoveSoundKey(moveId: string): string {
  return `custom_move_${moveId}`;
}

/** Reserved single-char keys already bound elsewhere (the global control
 * scheme's defaults) — used to warn authors, not to hard-block (a map
 * author may still know what they're doing). Derived from
 * shared/key-bindings.ts's DEFAULT_KEY_BINDINGS so this can never silently
 * drift out of sync with the actual bound keys again — it previously
 * hand-duplicated that list and was missing 'b' (Berserk's key). Callers
 * that have the live, admin-configured scheme in hand (not just defaults)
 * should check against that instead — see player-model-studio.tsx.
 */
export const RESERVED_MOVE_KEYS = new Set(Object.values(DEFAULT_KEY_BINDINGS));
