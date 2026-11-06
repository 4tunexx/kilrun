import { NextRequest } from 'next/server';

export type ApiRouteHandler = (
  request: NextRequest
) => Response | Promise<Response>;

export type ApiRouteMethods = Partial<
  Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', ApiRouteHandler>
>;

export type ApiRouteTable = Record<string, ApiRouteMethods>;

export type ApiCatchAllContext = {
  params: Promise<{ path: string[] }>;
};

function allowedMethods(handlers: ApiRouteMethods): string {
  const methods = Object.keys(handlers);
  if (handlers.GET) methods.push('HEAD');
  if (!handlers.OPTIONS) methods.push('OPTIONS');
  return [...new Set(methods)].join(', ');
}

export async function dispatchApiRoute(
  request: NextRequest,
  context: ApiCatchAllContext,
  routes: ApiRouteTable,
  fallback?: ApiRouteMethods
): Promise<Response> {
  const { path } = await context.params;
  const handlers = routes[path.join('/')] ?? fallback;
  if (!handlers) return new Response('Not Found', { status: 404 });

  const method = request.method.toUpperCase();
  if (method === 'HEAD' && handlers.GET) return handlers.GET(request);

  if (method === 'OPTIONS' && !handlers.OPTIONS) {
    return new Response(null, {
      status: 204,
      headers: { Allow: allowedMethods(handlers) },
    });
  }

  const handler = handlers[method as keyof ApiRouteMethods];
  if (!handler) {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: allowedMethods(handlers) },
    });
  }
  return handler(request);
}
