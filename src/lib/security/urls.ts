/**
 * Strict internal URL redirect validator
 * Prevents Open Redirect vulnerabilities (e.g. //evil.com, /\evil.com, %2f%2fevil.com, javascript:, data:, control chars, etc.)
 */
export function isSafeInternalRedirect(url: unknown): url is string {
  if (typeof url !== 'string' || !url) {
    return false;
  }

  // Must begin with a single slash
  if (!url.startsWith('/')) {
    return false;
  }

  // Must not start with double slash // or /\ which browsers treat as protocol-relative
  if (url.startsWith('//') || url.startsWith('/\\')) {
    return false;
  }

  // Must not contain any backslashes
  if (url.includes('\\')) {
    return false;
  }

  // Must not contain control characters or null bytes
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code < 32 || code === 127) {
      return false;
    }
  }

  // Check against percent-encoded bypass attempts (%5c, %2f, %00, etc.)
  if (url.includes('%')) {
    try {
      const decoded = decodeURIComponent(url);
      if (
        decoded.startsWith('//') ||
        decoded.startsWith('/\\') ||
        decoded.includes('\\') ||
        decoded.includes('\0')
      ) {
        return false;
      }
      for (let i = 0; i < decoded.length; i++) {
        const code = decoded.charCodeAt(i);
        if (code < 32 || code === 127) {
          return false;
        }
      }
    } catch {
      // Malformed percent-encoding is rejected
      return false;
    }
  }

  return true;
}

export function getSafeInternalRedirect(url: unknown, fallback = '/'): string {
  if (isSafeInternalRedirect(url)) {
    return url;
  }
  return fallback;
}

function isLocalLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

/**
 * Resolves the safe 303 redirect URL for POST /auth/logout.
 * - Preserves the request origin on local loopback hosts (localhost, 127.0.0.1, ::1)
 *   so local session cookies are never switched across origins.
 * - For non-local requests (e.g. Netlify where request.url may be rewritten to a deploy permalink),
 *   uses the validated public origin from NEXT_PUBLIC_APP_URL (http/https only, no credentials,
 *   root "/" without path/query/hash).
 * - Falls back to the request origin root "/" if NEXT_PUBLIC_APP_URL is missing or invalid.
 */
export function resolveLogoutRedirectUrl(
  requestUrl: string | URL,
  configuredAppUrl: unknown = process.env.NEXT_PUBLIC_APP_URL
): URL {
  const reqUrl = typeof requestUrl === 'string' ? new URL(requestUrl) : new URL(requestUrl.toString());

  if (isLocalLoopbackHost(reqUrl.hostname)) {
    return new URL('/', reqUrl.origin);
  }

  if (typeof configuredAppUrl === 'string' && configuredAppUrl.trim().length > 0) {
    try {
      const parsed = new URL(configuredAppUrl.trim());
      const isHttpOrHttps = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      const hasCredentials = parsed.username !== '' || parsed.password !== '';

      if (isHttpOrHttps && !hasCredentials && !isLocalLoopbackHost(parsed.hostname)) {
        return new URL('/', parsed.origin);
      }
    } catch {
      // Fall back to requestUrl.origin below
    }
  }

  return new URL('/', reqUrl.origin);
}
