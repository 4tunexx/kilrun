import {
  fetchGameProgression,
  fetchPowerDefinitionsForMenu,
  upgradeGameAbilityClient,
} from '@/lib/game-progression-client';
import type { GameProgressionSnapshot } from '@shared/ability-progression';

export type { GameProgressionSnapshot };

export async function getGameProgression(_userId: string): Promise<GameProgressionSnapshot | null> {
  // The HTTP route always resolves identity from the Engine session/auth
  // header now, never from a client-supplied id — see src/app/api/game/progression.
  return fetchGameProgression();
}

export async function getPowerDefinitionsForMenu() {
  return fetchPowerDefinitionsForMenu();
}

export async function grantGameXp(_userId: string, _amount: number) {
  return fetchGameProgression();
}

export async function upgradeGameAbility(userId: string, ability: string) {
  return upgradeGameAbilityClient(userId, ability as never);
}
