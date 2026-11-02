import type { NextConfig } from "next";

// One identifier per build, shared by the server and the browser bundle. CI
// uses the commit SHA so the post-deploy check can confirm what is live.
const buildId = (process.env.PAPELITO_BUILD_ID || process.env.GITHUB_SHA || `local-${Date.now().toString(36)}`)
  .replace(/[^0-9A-Za-z._-]/g, "")
  .slice(0, 40);

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
    ];
    const noStore = [
      { key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate, max-age=0' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'Expires', value: '0' },
    ];
    return [
      { source: '/:path*', headers: security },
      ...['/api/:path*', '/auth/:path*', '/unirse/:path*'].map(source => ({ source, headers: noStore })),
    ];
  },
};

export default nextConfig;
