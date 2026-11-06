import { NextRequest } from 'next/server';
import { dispatchApiRoute, type ApiCatchAllContext } from '@/lib/api-route-dispatcher';
import * as soundDefinitions from '@/lib/api-routes/admin/sound-definitions';
import * as uploadSiteImage from '@/lib/api-routes/admin/upload-site-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routes = {
  'sound-definitions': {
    GET: soundDefinitions.GET,
    POST: soundDefinitions.POST,
    PATCH: soundDefinitions.PATCH,
    DELETE: soundDefinitions.DELETE,
  },
  'upload-site-image': { POST: uploadSiteImage.POST },
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
