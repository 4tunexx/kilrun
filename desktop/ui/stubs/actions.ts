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

export async function mintMyGameJoinToken(): Promise<string | null> {
  return null;
}

export async function getMyMetricCounts() {
  return {};
}

export async function recordMatchStat(_input: unknown) {
  return { ok: true };
}

export async function recordDeathrunResult(_input: unknown) {
  return { ok: true };
}

export async function recordHordeResult(_input: unknown) {
  return { ok: true };
}

export async function recordCompetitiveResult(_input: unknown) {
  return { ok: true };
}
