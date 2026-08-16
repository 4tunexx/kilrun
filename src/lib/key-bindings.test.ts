import { describe, expect, it } from 'vitest';
import { isValidBindKey, keyBindToCodes, normalizeBindings } from '@shared/key-bindings';

describe('key-bindings', () => {
  it('correctly maps space key to ["Space"]', () => {
    expect(keyBindToCodes(' ')).toEqual(['Space']);
    expect(keyBindToCodes('space')).toEqual(['Space']);
    expect(keyBindToCodes('Space')).toEqual(['Space']);
    expect(isValidBindKey(' ')).toBe(true);
    expect(isValidBindKey('space')).toBe(true);
  });

  it('correctly maps letter, digit, shift, and control keys', () => {
    expect(keyBindToCodes('w')).toEqual(['KeyW']);
    expect(keyBindToCodes('1')).toEqual(['Digit1']);
    expect(keyBindToCodes('shift')).toEqual(['ShiftLeft', 'ShiftRight']);
    expect(keyBindToCodes('control')).toEqual(['ControlLeft', 'ControlRight']);
  });

  it('normalizes bindings preserving space for jump', () => {
    const normalized = normalizeBindings({ jump: ' ' });
    expect(normalized.jump).toBe(' ');
    expect(keyBindToCodes(normalized.jump)).toEqual(['Space']);
  });
});
