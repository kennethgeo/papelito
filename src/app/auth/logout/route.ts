import { NextRequest, NextResponse } from 'next/server';
import { isNeonAuthConfigured } from '@/lib/auth/config';
import { getNeonAuth } from '@/lib/auth/server';
import { resolveLogoutRedirectUrl } from '@/lib/security/urls';
import { clearPasskeySession, passkeyCookie } from '@/lib/auth/passkey-session';

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
  const response = NextResponse.redirect(targetUrl, 303);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
