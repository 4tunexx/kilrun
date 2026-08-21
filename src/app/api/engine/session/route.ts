import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import {
  handleStaffEngineResource,
  staffEngineResource,
} from '@/lib/engine/staff-extra-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function GET(req: NextRequest) {
  const resource = staffEngineResource(req);
  if (resource) return handleStaffEngineResource(req, resource, 'GET');
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

export async function POST(req: NextRequest) {
  const resource = staffEngineResource(req);
  if (resource) return handleStaffEngineResource(req, resource, 'POST');
  return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
}

export async function PATCH(req: NextRequest) {
  const resource = staffEngineResource(req);
  if (resource) return handleStaffEngineResource(req, resource, 'PATCH');
  return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
}

export async function DELETE(req: NextRequest) {
  const resource = staffEngineResource(req);
  if (resource) return handleStaffEngineResource(req, resource, 'DELETE');
  return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
}
