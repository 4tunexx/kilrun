import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { verifyEngineStaffToken } from '@/lib/engine/staff-token';

export type EngineStaff = {
  id: string;
  steamId: string;
  username: string;
  role: string;
};

function isDesktopOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === 'tauri.localhost' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'ipc.localhost'
    );
  } catch {
    return false;
  }
}

export function engineCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allow = !origin || isDesktopOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allow ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

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
  };
}
