import { NextRequest, NextResponse } from 'next/server';
import { isNeonAuthConfigured } from '@/lib/auth/config';
import { getNeonAuth } from '@/lib/auth/server';
import { getSafeInternalRedirect, resolveLogoutRedirectUrl } from '@/lib/security/urls';
import { clearPasskeySession, passkeyCookie } from '@/lib/auth/passkey-session';
import { clearNeonSessionCookies } from '@/lib/auth/session-guard';

export async function POST(request: NextRequest) {
  if (request.cookies.get(passkeyCookie().name)?.value) await clearPasskeySession();
  if (isNeonAuthConfigured()) {
    try {
      const auth = getNeonAuth();
      if (auth) {
        await auth.signOut();
      }
    } catch {
      // Continue to ensure local redirection happens even if auth service is down
    }
  }

  // Redirect with 303 See Other (POST -> GET) to canonical root and prevent caching
  const targetUrl = resolveLogoutRedirectUrl(request.url);
  // Re-authentication for sensitive actions: come back to the same internal place.
  const next = getSafeInternalRedirect(request.nextUrl.searchParams.get('next'), '');
  if (next && next !== '/') {
    targetUrl.searchParams.set('reingreso', '1');
    targetUrl.searchParams.set('next', next);
  }
  const response = NextResponse.redirect(targetUrl, 303);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  // Leaving must work even if Neon Auth or the database is unreachable.
  clearNeonSessionCookies(response.headers);
  return response;
}
