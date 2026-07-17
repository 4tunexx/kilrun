/**
 * Platform-wide username coloring: admins are always red, moderators
 * green, VIPs orange, everyone else the default (white/foreground). Used
 * anywhere a username is rendered — hover cards, leaderboard, chat, forum,
 * messages, profile pages, and the admin user list — so a player's status
 * is recognizable at a glance no matter where you see their name.
 */
export function getRoleTextColorClass(
  role: string | null | undefined,
  isVip?: boolean | null
): string {
  if (role === 'admin') return 'text-red-500';
  if (role === 'moderator') return 'text-green-500';
  if (role === 'vip' || isVip) return 'text-orange-400';
  return 'text-white';
}

export const ROLE_LEGEND: { role: string; label: string; className: string }[] = [
  { role: 'admin', label: 'Admin', className: 'text-red-500' },
  { role: 'moderator', label: 'Moderator', className: 'text-green-500' },
  { role: 'vip', label: 'VIP', className: 'text-orange-400' },
  { role: 'player', label: 'Player', className: 'text-white' },
];
