import { NextRequest, NextResponse } from 'next/server';
import { isNeonAuthConfigured } from '@/lib/auth/config';
import { getNeonAuth } from '@/lib/auth/server';

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);

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

  // Redirect with 303 See Other (POST -> GET) and prevent caching
  const response = NextResponse.redirect(new URL('/', requestUrl.origin), 303);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
