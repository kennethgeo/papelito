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
