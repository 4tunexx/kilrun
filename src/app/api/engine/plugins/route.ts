import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import { isPluginPermission, parsePluginManifest } from '@/lib/engine/plugin-manifest';
import { isAdminRole } from '@/lib/roles';
import { catalogSourceForPublish } from '@/lib/engine/plugin-catalog';
import { clipPluginSource } from '@shared/plugin-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    const body = (await req.json()) as {
      pluginId?: string;
      version?: string;
      source?: string;
      entry?: string;
      permissions?: unknown;
      modes?: unknown;
      weapons?: unknown;
      shopItems?: unknown;
      name?: string;
    };
    const pluginId = String(body.pluginId || '').trim();
    if (!pluginId) return engineJson(req, { ok: false, error: 'pluginId required' }, 400);

    const permissions = Array.isArray(body.permissions)
      ? body.permissions.filter(isPluginPermission)
      : undefined;
    // `server` ships the plugin's source to the authoritative Colyseus
    // process, which runs it in a Node `vm` sandbox — not a real security
    // boundary. Restricting who can grant it to full admins (not
    // moderators) shrinks the blast radius of a compromised staff account
    // reaching that runtime. Non-server plugins are unaffected.
    if (permissions?.includes('server') && !isAdminRole(staff.role)) {
      return engineJson(
        req,
        { ok: false, error: 'Only admins can publish plugins with server permission' },
        403
      );
    }
    const manifest = parsePluginManifest({
      id: pluginId,
      name: body.name || pluginId,
      version: body.version || '0.0.0',
      entry: body.entry || 'index.js',
      permissions,
      modes: body.modes,
    });
    const source = catalogSourceForPublish(String(body.source || ''), manifest.permissions);
    const manifestJson = JSON.stringify({
      ...manifest,
      weapons: Array.isArray(body.weapons) ? body.weapons.slice(0, 64) : undefined,
      shopItems: Array.isArray(body.shopItems) ? body.shopItems.slice(0, 64) : undefined,
    });

    const row = await prisma.gamePlugin.upsert({
      where: { pluginId: manifest.id },
      create: {
        pluginId: manifest.id,
        version: manifest.version,
        source: clipPluginSource(source),
        manifestJson,
        createdById: staff.id,
      },
      update: {
        version: manifest.version,
        source: clipPluginSource(source),
        manifestJson,
      },
    });

    return engineJson(req, { ok: true, pluginId: row.pluginId, version: row.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to publish plugin';
    const status =
      /staff only|not authenticated|session expired/i.test(message) ? 401 : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
