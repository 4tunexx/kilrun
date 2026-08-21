import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    return engineJson(req, {
      ok: true,
      user: {
        id: staff.id,
        username: staff.username,
        role: staff.role,
        steamId: staff.steamId,
        avatarUrl: staff.avatarUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not authenticated';
    const status = message === 'Staff only' ? 403 : 401;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
