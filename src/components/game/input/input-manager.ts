import { KeyboardHandler } from './keyboard';
import { MouseHandler } from './mouse';
import { DualJoystick } from './dual-joystick';
import { Vector2 } from '../types';

/**
 * Owns every input subsystem for a single game session and normalizes them
 * into one PC/mobile-agnostic API: a move vector, an aim angle, and
 * discrete shoot/crouch/interact/jump queries. `kilrun-engine.tsx` converts
 * the move vector from screen-space into world-space (accounting for the
 * isometric camera) before sending it to the server -- this class only
 * ever deals with raw input.
 */
export class InputManager {
  public keyboard: KeyboardHandler;
  public mouse: MouseHandler;
  public joystick: DualJoystick;

  private lastAimAngle = 0;

  public consumeAbilityPulse(ability: 'hook' | 'berserk' | 'bullet' | 'thunder' | 'visibility' | 'fly'): string | null {
    const key = this.getAbilityKey(ability);
    const down = this.keyboard.isPressed(key);
    const wasDown = this.abilityWasDown.get(ability) ?? false;
    this.abilityWasDown.set(ability, down);

    if (!down || wasDown) {
      return null;
    }

    return ability;
  }

  private getAbilityKey(ability: 'hook' | 'berserk' | 'bullet' | 'thunder' | 'visibility' | 'fly'): string {
    switch (ability) {
      case 'hook':
        return 'h';
      case 'berserk':
        return 'b';
      case 'bullet':
        return 'u';
      case 'thunder':
        return 't';
      case 'visibility':
        return 'z';
      case 'fly':
        return 'x';
    }
  }
}
