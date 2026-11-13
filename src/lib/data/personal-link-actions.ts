'use server';
import { openPersonalLink } from '@/lib/repositories/personal-links';
import { safeAction } from './access';

/**
 * Public action behind «Abrir mi papelito» on /papelito/<link>. No account:
 * the link itself is the credential, checked by its hash. Opening is a POST,
 * so link previews in messaging apps never count as an opening.
 */
export async function openPersonalPapelitoAction(token: string) {
  return safeAction(async () => openPersonalLink(token));
}
