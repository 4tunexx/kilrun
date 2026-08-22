import {
  fetchGameProgression,
  fetchPowerDefinitionsForMenu,
  upgradeGameAbilityClient,
} from '@/lib/game-progression-client';
import type { GameProgressionSnapshot } from '@shared/ability-progression';

export type { GameProgressionSnapshot };

export async function getGameProgression(userId: string): Promise<GameProgressionSnapshot | null> {
  return fetchGameProgression(userId);
}

export async function getPowerDefinitionsForMenu() {
  return fetchPowerDefinitionsForMenu();
}

export async function grantGameXp(_userId: string, _amount: number) {
  return fetchGameProgression(_userId);
}

export async function upgradeGameAbility(userId: string, ability: string) {
  return upgradeGameAbilityClient(userId, ability as never);
}
