import { Client } from 'colyseus';
import { CompetitiveRoom } from './CompetitiveRoom.js';

/** Solo map-editor Play Test — same Competitive sim, no matchmaking / rewards. */
export class CompetitivePracticeRoom extends CompetitiveRoom {
  maxClients = 1;
  protected usePublishedActiveMap = false;
  protected minPlayersToStart = 1;

  onCreate() {
    super.onCreate({});
    this.setPrivate(true);
    this.state.modeTag = 'competitive_practice';
  }

  async onLeave(client: Client, consented: boolean) {
    await super.onLeave(client, true);
    if (this.state.players.size === 0) {
      void this.disconnect();
    }
  }

  protected async reportRewards(_matchWinner: 'team_a' | 'team_b'): Promise<void> {
    for (const player of this.state.players.values()) {
      player.xpEarned = 0;
      player.vpEarned = 0;
      player.kpDelta = 0;
    }
    this.state.rewardsReady = false;
  }
}
