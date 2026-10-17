import { NextRequest, NextResponse } from 'next/server';
import { getSafeInternalRedirect } from '@/lib/security/urls';
import { isNeonAuthConfigured } from '@/lib/auth/config';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const nextParam = requestUrl.searchParams.get('next');
  const safeDestination = getSafeInternalRedirect(nextParam, '/');

  if (!isNeonAuthConfigured()) {
    const unconfiguredUrl = new URL('/auth/unconfigured', requestUrl.origin);
    const res = NextResponse.redirect(unconfiguredUrl);
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res;
  }

  const response = NextResponse.redirect(new URL(safeDestination, requestUrl.origin));
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
