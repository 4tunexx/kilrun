import type { PlayerState } from '../schema/RoomState.js';
import { fetchTrustedLoadout } from '../trusted-loadout.js';
import { applyAbilityStatsToPlayer, getMaxEnergyFor, getMaxHealth } from './ability-stats.js';
import { applyAbilityLevelsToPlayer } from './active-abilities.js';

const MONGO_ID = /^[a-f\d]{24}$/i;

/** Re-apply account power upgrades mid-match after the player spends Skill Points. */
export async function refreshPlayerAbilitiesFromTrustedLoadout(player: PlayerState): Promise<void> {
  if (!player.userId || !MONGO_ID.test(player.userId)) return;
  const trusted = await fetchTrustedLoadout(player.userId);
  if (!trusted) return;
  const prevMaxH = getMaxHealth(player);
  const prevMaxE = getMaxEnergyFor(player);
  applyAbilityStatsToPlayer(player, trusted.abilityStatBonuses);
  applyAbilityLevelsToPlayer(player, trusted.abilityLevels ?? null);
  const nextMaxH = getMaxHealth(player);
  const nextMaxE = getMaxEnergyFor(player);
  if (!player.isAlive) return;
  player.health = Math.min(nextMaxH, Math.max(1, player.health + (nextMaxH - prevMaxH)));
  player.energy = Math.min(nextMaxE, Math.max(0, player.energy + (nextMaxE - prevMaxE)));
}
