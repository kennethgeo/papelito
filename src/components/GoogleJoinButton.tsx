'use client';

import React from 'react';
import { PaperAccessCard } from '@/components/PaperAccessCard';

export function GoogleJoinButton({ nextUrl }: { nextUrl: string }) {
  return <PaperAccessCard nextUrl={nextUrl} compact />;
}
