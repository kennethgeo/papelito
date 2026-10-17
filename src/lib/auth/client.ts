'use client';

import { createAuthClient } from '@neondatabase/auth/next';

export const authClient = typeof window !== 'undefined' ? createAuthClient() : null;
