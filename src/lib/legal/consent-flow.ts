import { LEGAL_CONSTANTS } from '@/lib/legal/constants';
import { getLatestConsentStatus, recordConsent, revokeConsent } from '@/lib/repositories/profiles';

export const PENDING_CONSENT_COOKIE = 'papelito_pending_consent';
const MAX_PENDING_CONSENT_AGE_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CLOCK_SKEW_MS = 60 * 1000; // 1 minute

export interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
  delete(name: string): void;
}

export function formatPendingConsentCookieValue(
  version: string = LEGAL_CONSTANTS.VERSION,
  nowMs: number = Date.now()
): string {
  return `${version}|${Math.floor(nowMs)}`;
}

export function parsePendingConsentCookieValue(
  rawValue: string | undefined
): { version: string; intentAtMs: number } | null {
  if (!rawValue || typeof rawValue !== 'string') return null;
  let decoded = rawValue;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    // keep rawValue
  }
  const parts = decoded.split('|');
  if (parts.length !== 2) return null;
  const [version, tsStr] = parts;
  if (!version || !/^\d+$/.test(tsStr)) return null;
  const intentAtMs = Number(tsStr);
  if (!Number.isSafeInteger(intentAtMs) || intentAtMs <= 0) return null;
  return { version, intentAtMs };
}

/**
 * Consumes a one-time pending consent cookie in a POST / Server Action context.
 * - Never leaves the cookie behind (deletes it unconditionally on first inspection).
 * - Never re-grants consent from an intent timestamp older than or equal to the user's latest revocation.
 */
export async function consumePendingConsentIntent(
  userId: string,
  cookieStore: CookieStoreLike,
  nowMs: number = Date.now()
): Promise<{ hasCurrentConsent: boolean; latestVersion: string | null }> {
  const rawCookie = cookieStore.get(PENDING_CONSENT_COOKIE)?.value;
  if (rawCookie !== undefined) {
    try {
      cookieStore.delete(PENDING_CONSENT_COOKIE);
    } catch {
      // Ignore if called in a context where cookie deletion is unsupported
    }
  }

  const status = await getLatestConsentStatus(userId);
  if (status.hasCurrentConsent) {
    return { hasCurrentConsent: true, latestVersion: status.latestVersion };
  }

  const parsed = parsePendingConsentCookieValue(rawCookie);
  if (!parsed) {
    return { hasCurrentConsent: false, latestVersion: status.latestVersion };
  }

  if (parsed.version !== LEGAL_CONSTANTS.VERSION) {
    return { hasCurrentConsent: false, latestVersion: status.latestVersion };
  }

  if (parsed.intentAtMs > nowMs + MAX_CLOCK_SKEW_MS || nowMs - parsed.intentAtMs > MAX_PENDING_CONSENT_AGE_MS) {
    return { hasCurrentConsent: false, latestVersion: status.latestVersion };
  }

  if (status.revokedAt !== null) {
    const revokedAtMs = new Date(status.revokedAt).getTime();
    if (!Number.isFinite(revokedAtMs) || parsed.intentAtMs <= revokedAtMs) {
      return { hasCurrentConsent: false, latestVersion: null };
    }
  }

  await recordConsent(userId, LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION);
  return { hasCurrentConsent: true, latestVersion: LEGAL_CONSTANTS.VERSION };
}

/**
 * Revokes active consent in the database and deletes any pending consent cookie.
 */
export async function revokeConsentAndClearCookie(
  userId: string,
  cookieStore: CookieStoreLike
): Promise<boolean> {
  try {
    cookieStore.delete(PENDING_CONSENT_COOKIE);
  } catch {
    // Ignore if cookie deletion is unsupported
  }
  return await revokeConsent(userId);
}
