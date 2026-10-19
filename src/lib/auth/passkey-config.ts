import 'server-only';
// Server-only override permits testing the same build on an isolated origin.
// NEXT_PUBLIC_* is inlined by Next, including statically propagated aliases.
export function passkeyAppURL() {
  return process.env.PAPELITO_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://papelitocr.netlify.app';
}
