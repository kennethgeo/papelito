export function isNeonAuthConfigured(): boolean {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  return Boolean(baseUrl && secret && secret.length >= 32);
}

export function isBackendConfigured(): boolean {
  const dbUrl = process.env.DATABASE_URL;
  const hasDb = Boolean(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));
  return hasDb && isNeonAuthConfigured();
}
