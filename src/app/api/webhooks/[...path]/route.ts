import { NextRequest } from 'next/server';
import { dispatchApiRoute, type ApiCatchAllContext } from '@/lib/api-route-dispatcher';
import * as clerk from '@/lib/api-routes/webhooks/clerk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routes = {
  clerk: { POST: clerk.POST },
};

export function GET(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}

export function POST(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}

export function OPTIONS(req: NextRequest, context: ApiCatchAllContext) {
  return dispatchApiRoute(req, context, routes);
}
