'use server';
import { isDatabaseConfigured } from '@/lib/db/client';
import { openPersonalLink, previewPersonalLink, type PersonalLinkPreview } from '@/lib/repositories/personal-links';
import { safeAction } from './access';

/**
 * Public actions behind /papelito. No account: the link's secret is the
 * credential, checked by its hash. The page reads it from the URL fragment and
 * sends it here in the POST body, so it never appears in a URL the server (or
 * its request logs) sees. A failure is reported as a failure, never as an
 * invalid link.
 */
export async function previewPersonalPapelitoAction(token: string) {
  return safeAction(async (): Promise<PersonalLinkPreview> => (isDatabaseConfigured() ? previewPersonalLink(token) : { state: 'invalid' }));
}

/** «Abrir mi papelito»: an explicit action that records the opening. */
export async function openPersonalPapelitoAction(token: string) {
  return safeAction(async () => (isDatabaseConfigured() ? openPersonalLink(token) : { preview: { state: 'invalid' } as PersonalLinkPreview, papelito: null }));
}
