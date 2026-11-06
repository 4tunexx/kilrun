import { NextRequest } from 'next/server';
import { dispatchApiRoute, type ApiCatchAllContext } from '@/lib/api-route-dispatcher';
import * as acceptInvite from '@/lib/api-routes/engine/accept-invite';
import * as catalog from '@/lib/api-routes/engine/catalog';
import * as desktopLogin from '@/lib/api-routes/engine/desktop-login';
import * as download from '@/lib/api-routes/engine/download';
import * as ghosts from '@/lib/api-routes/engine/ghosts';
import * as maps from '@/lib/api-routes/engine/maps';
import * as plugins from '@/lib/api-routes/engine/plugins';
import * as session from '@/lib/api-routes/engine/session';
import * as version from '@/lib/api-routes/engine/version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routes = {
  'accept-invite': { GET: acceptInvite.GET },
  catalog: { GET: catalog.GET },
  'desktop-login': { GET: desktopLogin.GET },
  download: { GET: download.GET },
  ghosts: { GET: ghosts.GET, POST: ghosts.POST },
  maps: { GET: maps.GET, POST: maps.POST },
  plugins: { POST: plugins.POST },
  session: {
    GET: session.GET,
    POST: session.POST,
    PATCH: session.PATCH,
    DELETE: session.DELETE,
    OPTIONS: session.OPTIONS,
  },
  version: { GET: version.GET },
};

export function GET(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}

export function POST(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}

export function PATCH(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}

export function DELETE(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}

export function OPTIONS(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}
