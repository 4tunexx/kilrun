import { NextRequest } from 'next/server';
import { dispatchApiRoute, type ApiCatchAllContext } from '@/lib/api-route-dispatcher';
import * as abandonMatch from '@/lib/api-routes/game/abandon-match';
import * as activeMap from '@/lib/api-routes/game/active-map';
import * as adminAction from '@/lib/api-routes/game/admin-action';
import * as chatFlag from '@/lib/api-routes/game/chat-flag';
import * as matchResult from '@/lib/api-routes/game/match-result';
import * as playerLoadout from '@/lib/api-routes/game/player-loadout';
import * as pluginModes from '@/lib/api-routes/game/plugin-modes';
import * as gamePlugins from '@/lib/api-routes/game/plugins';
import * as powerDefinitions from '@/lib/api-routes/game/power-definitions';
import * as progression from '@/lib/api-routes/game/progression';
import * as weaponDefinitions from '@/lib/api-routes/game/weapon-definitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routes = {
  'abandon-match': { GET: abandonMatch.GET, POST: abandonMatch.POST },
  'active-map': { GET: activeMap.GET },
  'admin-action': { POST: adminAction.POST },
  'chat-flag': { POST: chatFlag.POST },
  'match-result': { POST: matchResult.POST },
  'player-loadout': { GET: playerLoadout.GET },
  'plugin-modes': { GET: pluginModes.GET },
  plugins: { GET: gamePlugins.GET },
  'power-definitions': {
    GET: powerDefinitions.GET,
    POST: powerDefinitions.POST,
    PATCH: powerDefinitions.PATCH,
    DELETE: powerDefinitions.DELETE,
  },
  progression: { GET: progression.GET, POST: progression.POST },
  'weapon-definitions': {
    GET: weaponDefinitions.GET,
    POST: weaponDefinitions.POST,
    PATCH: weaponDefinitions.PATCH,
    DELETE: weaponDefinitions.DELETE,
  },
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
