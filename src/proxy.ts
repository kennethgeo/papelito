import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getNeonAuth } from '@/lib/auth/neon';

function applyPrivateNoStoreHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasVerifier = request.nextUrl.searchParams.has('neon_auth_session_verifier');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasAuthCookie = cookieHeader.includes('__Secure-neon-auth') || cookieHeader.includes('papelito_passkey');
  const isAuthOrApiPath = pathname.startsWith('/auth') || pathname.startsWith('/api');

  const auth = getNeonAuth();
  if (!auth) {
    const fallbackResponse = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
    if (isAuthOrApiPath || hasVerifier || hasAuthCookie) {
      applyPrivateNoStoreHeaders(fallbackResponse);
    }
    return fallbackResponse;
  }

  // Invoke official Neon Auth middleware without custom loginUrl so '/' and '/unirse'
  // are never skipped as loginPathname and always process OAuth session verifier exchange.
  const authMiddleware = auth.middleware();
  const authResponse = await authMiddleware(request);

  // If the official middleware returned a redirect to the default unauthenticated loginUrl
  // ('/auth/sign-in'), allow guests through on public pages while preserving any cookie cleanup.
  const redirectLocation = authResponse.headers.get('location');
  if (redirectLocation) {
    try {
      const redirectUrl = new URL(redirectLocation, request.url);
      if (redirectUrl.pathname === '/auth/sign-in') {
        const guestResponse = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        for (const setCookie of authResponse.headers.getSetCookie()) {
          guestResponse.headers.append('Set-Cookie', setCookie);
        }
        if (isAuthOrApiPath || hasVerifier || hasAuthCookie || guestResponse.headers.getSetCookie().length > 0) {
          applyPrivateNoStoreHeaders(guestResponse);
        }
        return guestResponse;
      }
    } catch {
      // If location is not a valid URL, return authResponse as-is below
    }
  }

  if (isAuthOrApiPath || hasVerifier || hasAuthCookie || authResponse.headers.getSetCookie().length > 0) {
    applyPrivateNoStoreHeaders(authResponse);
  }

  return authResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - fonts, images, manifest and service worker
     */
    '/((?!_next/static|_next/image|favicon.ico|fonts/|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
