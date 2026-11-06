import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEngineStaff: vi.fn(),
  findUniqueUser: vi.fn(),
  mintGameJoinToken: vi.fn(),
  getSiteSettings: vi.fn(),
}));

vi.mock('@/lib/engine/engine-api', () => ({
  engineJson: (_req: Request, body: unknown, status = 200) => Response.json(body, { status }),
  engineOptions: () => new Response(null, { status: 204 }),
  requireEngineStaff: mocks.requireEngineStaff,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUniqueUser } },
}));
vi.mock('@/lib/game-join-token', () => ({ mintGameJoinToken: mocks.mintGameJoinToken }));
vi.mock('@/lib/premium', () => ({
  isPremiumActive: ({ isVip }: { isVip: boolean }) => isVip,
  canAccessRankedCompetitive: ({ isPremium }: { isPremium: boolean }) => isPremium,
}));
vi.mock('@/lib/premium-config', () => ({ parsePremiumConfig: (json: string) => JSON.parse(json) }));
vi.mock('@/lib/progression-actions', () => ({
  getSiteSettings: mocks.getSiteSettings,
}));
vi.mock('@/lib/kp', () => ({ KP_DEFAULT: 1000 }));

describe('Engine join-token endpoint', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireEngineStaff.mockResolvedValue({ id: 'staff-1' });
    mocks.findUniqueUser.mockResolvedValue({
      id: 'staff-1',
      steamId: '76561198000000000',
      username: 'Staff',
      avatarUrl: '/avatar.png',
      role: 'moderator',
      isBanned: false,
      isVip: true,
      premiumExpiresAt: null,
      kp: 1350,
    });
    mocks.getSiteSettings.mockResolvedValue({ premiumConfigJson: '{}' });
    mocks.mintGameJoinToken.mockReturnValue('short-lived-token');
    mocks.mintGameJoinToken.mockClear();
  });

  it('mints a token from the authenticated staff user database claims', async () => {
    const { POST } = await import('./join-token');
    const response = await POST(new Request('https://kilrun.example/api/engine/join-token') as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      token: 'short-lived-token',
      user: { id: 'staff-1', username: 'Staff', role: 'moderator' },
    });
    expect(mocks.mintGameJoinToken).toHaveBeenCalledWith({
      userId: 'staff-1',
      steamId: '76561198000000000',
      username: 'Staff',
      avatarUrl: '/avatar.png',
      isAdmin: false,
      isStaff: true,
      isPremium: true,
      rankedAccess: true,
      kp: 1350,
    });
  });

  it('refuses to mint when the linked staff session is unauthenticated', async () => {
    mocks.requireEngineStaff.mockRejectedValue(new Error('Not authenticated'));
    const { POST } = await import('./join-token');
    const response = await POST(new Request('https://kilrun.example/api/engine/join-token') as never);

    expect(response.status).toBe(401);
    expect(mocks.mintGameJoinToken).not.toHaveBeenCalled();
  });
});
