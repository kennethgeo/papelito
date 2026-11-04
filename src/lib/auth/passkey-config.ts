import 'server-only';
// The origin passkeys are bound to (the WebAuthn relying party). It must be the
// public address people open: PAPELITO_APP_URL (server-only, lets the same
// build be tested on an isolated origin) or NEXT_PUBLIC_APP_URL (inlined by
// Next, including statically propagated aliases). Production never guesses a
// host: without either variable, passkeys are refused rather than bound to an
// old or wrong origin. Local development and tests use the Next dev origin.
export function passkeyAppURL() {
  const configured = process.env.PAPELITO_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured;
  const workers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
  if (!workers && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  throw new Error('Falta PAPELITO_APP_URL o NEXT_PUBLIC_APP_URL para vincular las passkeys al origen correcto.');
}
