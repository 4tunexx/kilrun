export type KillFeedKind = 'player' | 'monster' | 'trap' | 'world';

export interface KillFeedEvent {
  killer: string;
  killerId?: string;
  victim: string;
  victimId?: string;
  kind: KillFeedKind;
  weaponId?: string;
}

export function broadcastKillFeed(
  room: { broadcast(type: string, message: KillFeedEvent): void },
  event: KillFeedEvent
): void {
  room.broadcast('killFeed', event);
}
