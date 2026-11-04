import { NextRequest, NextResponse } from 'next/server';
import { getNeonAuth } from '@/lib/auth/server';
import { filterSessionReadResponse, guardAuthProxyRequest, authPathPolicy } from '@/lib/auth/session-guard';

type RouteContext = { params: Promise<{ path: string[] }> };

function unconfigured() {
  return NextResponse.json({ error: 'Neon Auth no está configurado en este entorno.' }, { status: 503 });
}

// Sessions closed from «Seguridad» stay blocked here too: the proxy refuses
// account operations (link accounts, list or revoke sessions, update the user…)
// for a revoked session, while sign-in, recovery and sign-out keep working.
async function forward(method: 'GET' | 'POST', request: NextRequest, context: RouteContext) {
  const auth = getNeonAuth();
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!auth || !baseUrl) return unconfigured();
  const path = (await context.params).path.join('/');
  const blocked = await guardAuthProxyRequest(request, path, baseUrl);
  if (blocked) return blocked;
  const handler = auth.handler();
  const response = await handler[method](request, context);
  return authPathPolicy(path) === 'session-read' ? filterSessionReadResponse(response) : response;
}

export function GET(request: NextRequest, context: RouteContext) {
  return forward('GET', request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return forward('POST', request, context);
}
