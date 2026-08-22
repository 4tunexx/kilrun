import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_BINDINGS,
  eventMatchesBind,
  formatBindKey,
  isValidBindKey,
  keyBindToCodes,
  normalizeBindings,
} from '@shared/key-bindings';

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

  it('maps pause / scoreboard / free-mouse keys', () => {
    expect(keyBindToCodes('escape')).toEqual(['Escape']);
    expect(keyBindToCodes('esc')).toEqual(['Escape']);
    expect(keyBindToCodes('tab')).toEqual(['Tab']);
    expect(keyBindToCodes('`')).toEqual(['Backquote']);
    expect(keyBindToCodes('backquote')).toEqual(['Backquote']);
    expect(isValidBindKey('escape')).toBe(true);
    expect(isValidBindKey('tab')).toBe(true);
    expect(isValidBindKey('`')).toBe(true);
    expect(eventMatchesBind({ code: 'Escape' }, 'escape')).toBe(true);
    expect(eventMatchesBind({ code: 'Tab' }, 'tab')).toBe(true);
    expect(eventMatchesBind({ code: 'Backquote' }, '`')).toBe(true);
    expect(keyBindToCodes('alt')).toEqual(['AltLeft', 'AltRight']);
    expect(isValidBindKey('alt')).toBe(true);
    expect(eventMatchesBind({ code: 'AltLeft' }, 'alt')).toBe(true);
    expect(formatBindKey('alt')).toBe('Alt');
    expect(DEFAULT_KEY_BINDINGS.scoreboard).toBe('tab');
    expect(DEFAULT_KEY_BINDINGS.freeMouse).toBe('alt');
    const migrated = normalizeBindings({ scoreboard: '`', freeMouse: 'tab' });
    expect(migrated.scoreboard).toBe('tab');
    expect(migrated.freeMouse).toBe('alt');
  });

  it('formats HUD labels for interface binds', () => {
    expect(formatBindKey('escape')).toBe('Esc');
    expect(formatBindKey('tab')).toBe('Tab');
    expect(formatBindKey('`')).toBe('`');
    expect(formatBindKey(' ')).toBe('Space');
  });

  it('normalizes bindings preserving space for jump and interface defaults', () => {
    const normalized = normalizeBindings({ jump: ' ' });
    expect(normalized.jump).toBe(' ');
    expect(keyBindToCodes(normalized.jump)).toEqual(['Space']);
    expect(normalized.pause).toBe(DEFAULT_KEY_BINDINGS.pause);
    expect(normalized.scoreboard).toBe(DEFAULT_KEY_BINDINGS.scoreboard);
    expect(normalized.freeMouse).toBe(DEFAULT_KEY_BINDINGS.freeMouse);
    expect(normalized.aim).toBe('mouse2');
  });

  it('accepts mouse buttons for aim and formats HUD labels', () => {
    expect(isValidBindKey('mouse2')).toBe(true);
    expect(isValidBindKey('rmb')).toBe(true);
    expect(isValidBindKey('mouse0')).toBe(true);
    expect(formatBindKey('mouse2')).toBe('RMB');
    expect(formatBindKey('mouse0')).toBe('LMB');
    const rebound = normalizeBindings({ aim: 'mouse0' });
    expect(rebound.aim).toBe('mouse0');
  });
});
