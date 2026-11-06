import { NextRequest } from 'next/server';
import { dispatchApiRoute, type ApiCatchAllContext } from '@/lib/api-route-dispatcher';
import * as nextAuth from '@/lib/api-routes/auth/[...nextauth]';
import * as devLogin from '@/lib/api-routes/auth/dev-login';
import * as steam from '@/lib/api-routes/auth/steam';
import * as steamCallback from '@/lib/api-routes/auth/steam/callback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routes = {
  'dev-login': { GET: devLogin.GET },
  steam: { GET: steam.GET },
  'steam/callback': { GET: steamCallback.GET },
};

const fallback = { GET: nextAuth.GET, POST: nextAuth.POST };

export function GET(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes, fallback);
}

export function POST(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes, fallback);
}

export function PATCH(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes, fallback);
}

export function DELETE(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes, fallback);
}

export function OPTIONS(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes, fallback);
}
