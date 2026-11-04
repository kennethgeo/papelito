'use client';

import { RecoverableError } from '@/components/RecoverableError';

// Replaces the root layout when it fails, so it brings its own document.
export default function GlobalError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Papelito — Algo salió mal</title>
      </head>
      <body style={{ margin: 0 }}>
        <RecoverableError error={error} retry={retry} reset={reset} />
      </body>
    </html>
  );
}
