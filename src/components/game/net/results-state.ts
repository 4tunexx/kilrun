export type CompetitiveTeam = 'team_a' | 'team_b';
export type RewardDisplayStatus = 'pending' | 'confirmed' | 'unavailable';

export function isPracticeRoom(modeTag?: string): boolean {
  return modeTag?.endsWith('_practice') ?? false;
}

export function lockFirstValidCompetitiveTeam(
  current: CompetitiveTeam | null,
  candidate: string
): CompetitiveTeam | null {
  if (current) return current;
  return candidate === 'team_a' || candidate === 'team_b' ? candidate : null;
}

export function getRewardDisplayValue(
  value: number | undefined,
  status: RewardDisplayStatus
): string {
  if (status === 'pending') return 'Pending';
  if (status === 'unavailable') return 'Unavailable';
  return `+${value ?? 0}`;
}
