import type { NextConfig } from "next";

// One identifier per build, shared by the server and the browser bundle. CI
// uses the commit SHA so the post-deploy check can confirm what is live.
const buildId = (process.env.PAPELITO_BUILD_ID || process.env.GITHUB_SHA || `local-${Date.now().toString(36)}`)
  .replace(/[^0-9A-Za-z._-]/g, "")
  .slice(0, 40);

/**
 * Content Security Policy in report-only mode: browsers report what it would
 * block (to /api/csp-report, logged without personal data) and block nothing.
 * Inline scripts and styles stay allowed because Next/vinext inline their
 * bootstrap and React uses style attributes; moving to nonces is a separate
 * step. frame-ancestors is not valid in report-only (X-Frame-Options covers it).
 * Images: same origin, data: (invitation QR, photo previews) and blob:.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
  "report-to csp",
].join('; ');

/**
 * Turns off powerful features Papelito never uses. Passkeys (publickey-
 * credentials-*), clipboard and Web Share keep their default (same origin);
 * choosing a photo uses the file picker, which this policy does not affect.
 */
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()';

const nextConfig: NextConfig = {
  env: { PAPELITO_BUILD_ID: buildId },
  generateBuildId: async () => buildId,
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
      { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
      { key: 'Reporting-Endpoints', value: 'csp="/api/csp-report"' },
    ];
    const noStore = [
      { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate, max-age=0' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
    ];
    return [
      { source: '/:path*', headers: security },
      ...['/api/:path*', '/auth/:path*', '/unirse/:path*', '/papelito/:path*'].map(source => ({ source, headers: noStore })),
      // Personal links: never indexed, and the link never leaves in a Referer header.
      { source: '/papelito/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};

export default nextConfig;
