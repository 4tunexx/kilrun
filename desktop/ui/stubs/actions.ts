const DESKTOP_USER = {
  id: 'desktop-editor',
  steamId: '0',
  username: 'Editor',
  avatarUrl: '/K2.png',
  role: 'admin',
  isBanned: false,
  isVip: true,
  vpCurrency: 0,
  xpProgress: 0,
};

export async function getSessionUser() {
  return DESKTOP_USER;
}

export async function mintMyLoadoutToken(): Promise<string | null> {
  return null;
}

export async function mintMyGameJoinToken(): Promise<string | null> {
  const claims = {
    userId: 'desktop-editor',
    steamId: '0',
    username: 'Editor',
    avatarUrl: '/K2.png',
    isAdmin: true,
    isStaff: true,
    isPremium: true,
    rankedAccess: true,
    kp: 1000,
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const body = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.desktop-editor-practice-token`;
}

export async function getMyMetricCounts() {
  return {};
}

/** Offline Engine has no Mongo rewards pipeline — return zeros, never fake XP. */
const OFFLINE_REWARDS = { xpEarned: 0, vpEarned: 0 };

export async function recordMatchStat(_input: unknown) {
  return { ok: false as const, unavailable: true };
}

export async function recordDeathrunResult(_input: unknown) {
  return OFFLINE_REWARDS;
}

export async function recordHordeResult(_input: unknown) {
  return OFFLINE_REWARDS;
}

export async function recordCompetitiveResult(_input: unknown) {
  return { ...OFFLINE_REWARDS, kpDelta: 0, kp: 0, rank: 'Unranked' };
}
