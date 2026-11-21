import { afterEach, describe, expect, it } from 'vitest';
import { OWNER_STEAM_IDS, steamIdsPromotedToAdmin } from './roles';

const originalSelfHosted = process.env.KILRUN_SELF_HOSTED;
const originalAdmins = process.env.ADMIN_STEAM_IDS;

afterEach(() => {
  if (originalSelfHosted === undefined) delete process.env.KILRUN_SELF_HOSTED;
  else process.env.KILRUN_SELF_HOSTED = originalSelfHosted;
  if (originalAdmins === undefined) delete process.env.ADMIN_STEAM_IDS;
  else process.env.ADMIN_STEAM_IDS = originalAdmins;
});

describe('administrator bootstrap', () => {
  it('preserves the original owner on the existing deployment', () => {
    delete process.env.KILRUN_SELF_HOSTED;
    process.env.ADMIN_STEAM_IDS = ' 12345678901234567 , 23456789012345678 ';
    expect(steamIdsPromotedToAdmin()).toEqual(
      new Set([...OWNER_STEAM_IDS, '12345678901234567', '23456789012345678'])
    );
  });

  it('uses only configured administrators for self-hosted installations', () => {
    process.env.KILRUN_SELF_HOSTED = '1';
    process.env.ADMIN_STEAM_IDS = '12345678901234567';
    expect(steamIdsPromotedToAdmin()).toEqual(new Set(['12345678901234567']));
  });
});
