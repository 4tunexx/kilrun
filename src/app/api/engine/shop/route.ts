import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import { upsertStoreItemAsStaff, type UpsertStoreItemInput } from '@/lib/store-item-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const body = (await req.json()) as UpsertStoreItemInput;
    const item = await upsertStoreItemAsStaff(body);
    return engineJson(req, { ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    const status = /staff only|not authenticated|session expired/i.test(message) ? 401 : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
