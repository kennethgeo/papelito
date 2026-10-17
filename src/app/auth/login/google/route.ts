import { NextRequest, NextResponse } from 'next/server';
import { isNeonAuthConfigured } from '@/lib/auth/config';
import { getNeonAuth } from '@/lib/auth/server';
import { getSafeInternalRedirect } from '@/lib/security/urls';

/**
 * OAuth initiation via GET is explicitly forbidden by Managed Better Auth specification.
 * Social sign-in requires POST to /api/auth/sign-in/social via authClient.signIn.social.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const nextParam = requestUrl.searchParams.get('next');
  const safeNext = getSafeInternalRedirect(nextParam, '/');

  if (!isNeonAuthConfigured()) {
    const unconfiguredUrl = new URL('/auth/unconfigured', requestUrl.origin);
    unconfiguredUrl.searchParams.set('provider', 'google');
    if (safeNext !== '/') {
      unconfiguredUrl.searchParams.set('next', safeNext);
    }
    const res = NextResponse.redirect(unconfiguredUrl);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  }

  // Reject GET initiation to prevent CSRF / unauthorized OAuth initiation via link prefetching
  return NextResponse.json(
    {
      error: 'Método GET no permitido para inicio de sesión OAuth. Utilice authClient.signIn.social con POST.',
      recommendedAction: 'Usar cliente oficial authClient.signIn.social({ provider: "google", callbackURL })',
    },
    {
      status: 405,
      headers: {
        Allow: 'POST',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

/**
 * POST handler for server-side OAuth initiation
 */
export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const nextParam = requestUrl.searchParams.get('next');
  const safeNext = getSafeInternalRedirect(nextParam, '/');

  if (!isNeonAuthConfigured()) {
    return NextResponse.json(
      { error: 'El servicio de autenticación con Google no está configurado en este entorno.' },
      { status: 503 }
    );
  }

  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: 'No se pudo inicializar el servidor de autenticación.' },
      { status: 503 }
    );
  }

  try {
    const callbackURL = new URL(safeNext, requestUrl.origin).toString();
    const result = await auth.signIn.social({
      provider: 'google',
      callbackURL,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message || 'Error en autenticación' }, { status: 400 });
    }

    if (result.data?.url) {
      return NextResponse.json({ url: result.data.url });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar solicitud de autenticación.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
