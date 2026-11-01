import 'server-only';
// Server-only override permits testing the same build on an isolated origin.
// NEXT_PUBLIC_* is inlined by Next, including statically propagated aliases.
export function passkeyAppURL() {
  const configured = process.env.PAPELITO_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured;
  if (navigator.userAgent === 'Cloudflare-Workers') {
    throw new Error('PAPELITO_APP_URL es obligatoria en Cloudflare para vincular passkeys al origen correcto.');
  }
  return 'https://papelitocr.netlify.app';
}
