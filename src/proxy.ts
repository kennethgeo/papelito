import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isNeonAuthConfigured } from '@/lib/auth/config';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // If path is auth or api related, enforce strict anti-cache headers
  if (request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname.startsWith('/api')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
  }

  // If Neon Auth is not configured, proceed without session refresh
  if (!isNeonAuthConfigured()) {
    return response;
  }

  return response;
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
