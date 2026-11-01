import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
