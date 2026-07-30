import { Client } from 'colyseus';
import { DeathrunRoom } from './DeathrunRoom.js';

/**
 * Private, single-player Deathrun room used by the map editor's "Play Test"
 * feature so map builders can test their in-progress map against the EXACT
 * same client/server code path as a real live Deathrun match — same sim,
 * same HUD, same chat, same admin panel — without touching real matchmaking,
 * real players, or granting real XP/VP/currency rewards.
 *
 * Reuses 100% of DeathrunRoom's simulation/chat/ability/custom-map logic;
 * only three things differ:
 *   1. maxClients = 1 and the room is marked private (`setPrivate()`) so it
 *      never appears in normal `joinOrCreate` matchmaking for 'deathrun'.
 *   2. Reward reporting is skipped entirely — practice runs never call the
 *      real match-report endpoint, so no XP/VP/currency is ever granted.
 *   3. Idle/abandoned practice rooms self-dispose quickly (no reason to let
 *      them linger consuming server resources once the sole player leaves).
 */
export class DeathrunPracticeRoom extends DeathrunRoom {
  maxClients = 1;

  onCreate(options?: unknown) {
    super.onCreate();
    this.setPrivate(true);
    this.state.modeTag = 'deathrun_practice';

    // Solo practice — always a runner by default; trapper testing is done via
    // this message (no second player to auto-assign trapper to like a real
    // match would). Registered once here, not per-join, since maxClients = 1
    // makes re-registration on join both unnecessary and easy to leak.
    this.onMessage(
      'practiceSetRole',
      (client: Client, payload: { role?: 'runner' | 'trapper' } | undefined) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        const role = payload?.role === 'trapper' ? 'trapper' : 'runner';
        player.role = role;
        player.bodyColorIndex = role === 'trapper' ? 0 : 1;
      }
    );
  }

  onLeave(client: Client) {
    super.onLeave(client);
    // Solo room — once the only player leaves, nothing useful is left running.
    if (this.state.players.size === 0) {
      void this.disconnect();
    }
  }

  /**
   * Never report practice results to the real rewards pipeline. Populate the
   * same display-only fields the live room falls back to (see
   * DeathrunRoom.reportRewards's local branch) so the results screen still
   * renders correctly, just with zeroed-out rewards. Overrides (not calls)
   * the base implementation — no network call to the match-report endpoint
   * ever happens for a practice run.
   */
  protected async reportRewards(_winnerRole: 'trapper' | 'runner'): Promise<void> {
    for (const player of this.state.players.values()) {
      player.xpEarned = 0;
      player.vpEarned = 0;
      player.kpDelta = 0;
    }
    this.state.rewardsReady = false;
  }
}
