import { Client } from 'colyseus';
import { HordeRoom } from './HordeRoom.js';

/** Solo map-editor Play Test — same Horde sim, no matchmaking / rewards. */
export class HordePracticeRoom extends HordeRoom {
  maxClients = 1;
  protected usePublishedActiveMap = false;
  protected minPlayersToStart = 1;

  onCreate() {
    super.onCreate();
    this.setPrivate(true);
    this.state.modeTag = 'horde_practice';
  }

  async onLeave(client: Client, consented: boolean) {
    await super.onLeave(client, true);
    if (this.state.players.size === 0) {
      void this.disconnect();
    }
  }

  protected async reportRewards(_winnerRole: 'survivor' | 'horde'): Promise<void> {
    for (const player of this.state.players.values()) {
      player.xpEarned = 0;
      player.vpEarned = 0;
      player.kpDelta = 0;
    }
    this.state.rewardsReady = false;
  }
}
