'use client';

import { RecoverableError } from '@/components/RecoverableError';

export default function Error({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  return <RecoverableError error={error} retry={retry} reset={reset} />;
}
