import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { verifyEngineStaffToken } from '@/lib/engine/staff-token';
import { engineCorsHeaders } from '@/lib/engine/engine-cors';

export { engineCorsHeaders } from '@/lib/engine/engine-cors';

export type EngineStaff = {
  id: string;
  steamId: string;
  username: string;
  role: string;
  avatarUrl: string;
};

export function engineOptions(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: engineCorsHeaders(req) });
}

export function engineJson(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: engineCorsHeaders(req) });
}

export async function requireEngineStaff(req: NextRequest): Promise<EngineStaff> {
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
  const secret = process.env.AUTH_SECRET || '';
  if (token && secret) {
    const payload = verifyEngineStaffToken(token, secret);
    if (!payload) throw new Error('Engine session expired — sign in again');
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.steamId !== payload.steamId || user.isBanned || !canAccessAdmin(user.role)) {
      throw new Error('Staff only');
    }
    return {
      id: user.id,
      steamId: user.steamId,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl || '',
    };
  }

  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Staff only');
  }
  return {
    id: user.id,
    steamId: user.steamId,
    username: user.username,
    role: user.role,
    avatarUrl: user.avatarUrl || '',
  };
}
