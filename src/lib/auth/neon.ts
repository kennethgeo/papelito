import 'server-only';
import { isNeonAuthConfigured } from './config';
import { createNeonAuth } from '@neondatabase/auth/next/server';
let authInstance: ReturnType<typeof createNeonAuth> | null = null;
let cachedConfigKey: string | null = null;

export function getNeonAuth() {
  if (!isNeonAuthConfigured()) {
    authInstance = null;
    cachedConfigKey = null;
    return null;
  }
  const baseUrl = process.env.NEON_AUTH_BASE_URL!;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET!;
  const configKey = `${baseUrl}|${secret}`;
  if (!authInstance || cachedConfigKey !== configKey) {
    authInstance = createNeonAuth({
      baseUrl,
      cookies: {
        secret,
        sessionDataTtl: 300,
      },
    });
    cachedConfigKey = configKey;
  }
  return authInstance;
}

