/** Build running in this browser (inlined at build time). */
export const CLIENT_BUILD_ID = process.env.PAPELITO_BUILD_ID || '';
export const NEW_VERSION_EVENT = 'papelito:new-version';

export type VersionCheck = 'same' | 'new' | 'unknown';

/**
 * Compares the running build with the deployed one. Announces a new version
 * with a window event; never reloads or retries anything by itself.
 */
export async function checkDeployedVersion(timeoutMs = 4000): Promise<VersionCheck> {
  if (typeof window === 'undefined' || !CLIENT_BUILD_ID) return 'unknown';
  try {
    const response = await fetch('/api/version', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return 'unknown';
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== 'string' || body.version === 'desconocida') return 'unknown';
    if (body.version === CLIENT_BUILD_ID) return 'same';
    window.dispatchEvent(new CustomEvent(NEW_VERSION_EVENT));
    return 'new';
  } catch {
    return 'unknown';
  }
}
