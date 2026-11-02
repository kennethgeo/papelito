'use client';

// Must stay the first import: see zod-jitless.ts.
import './zod-jitless';
import { createAuthClient } from '@neondatabase/auth/next';

export const authClient = typeof window !== 'undefined' ? createAuthClient() : null;
