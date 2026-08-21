import { describe, expect, it } from 'vitest';
import { parseStaffEngineResource } from '@/lib/engine/staff-resource';

describe('parseStaffEngineResource', () => {
  it('accepts rewrite resource names', () => {
    expect(parseStaffEngineResource('sounds')).toBe('sounds');
    expect(parseStaffEngineResource('join-token')).toBe('join-token');
  });

  it('returns null for the plain session GET', () => {
    expect(parseStaffEngineResource(null)).toBeNull();
    expect(parseStaffEngineResource('maps')).toBeNull();
  });
});
