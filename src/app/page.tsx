import React, { Suspense } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { isNeonAuthConfigured } from '@/lib/auth/config';
import { getSessionState } from '@/lib/auth/server';
import { isDatabaseConfigured } from '@/lib/db/client';
import { getOrCreateProfile, getLatestConsentStatus } from '@/lib/repositories/profiles';
import { logError } from '@/lib/observability/log';
import { RealDataProvider, RealUser } from '@/context/RealDataContext';
import { RealAppShell } from '@/components/RealAppShell';
import { DemoDataProvider } from '@/context/DemoDataContext';
import { DemoAppShell } from '@/components/DemoAppShell';
import { SessionUnavailable } from '@/components/SessionUnavailable';
import { WelcomeView } from '@/views/WelcomeView';

interface PageProps {
  searchParams: Promise<{ mode?: string }>;
}

async function HomeContent({ searchParams }: PageProps) {
  const { mode } = await searchParams;

  // 1. Explicit demo mode requested by user
  if (mode === 'demo') {
    return (
      <DemoDataProvider>
        <DemoAppShell />
      </DemoDataProvider>
    );
  }

  // 2. Session: confirmed, absent or unknown. Unknown never becomes "guest".
  const state = isNeonAuthConfigured() ? await getSessionState() : { status: 'anonymous' as const };
  if (state.status === 'unavailable') return <SessionUnavailable />;

  if (state.status === 'authenticated') {
    const sessionUser = state.user;
    let realUser: RealUser = {
      id: sessionUser.id,
      email: sessionUser.email || '',
      alias: sessionUser.name || sessionUser.email?.split('@')[0] || 'Participante',
      fullName: sessionUser.name || sessionUser.email || 'Participante',
      avatarColor: sessionUser.avatarColor || '#46245D',
      hasConsented: false,
      consentVersion: null,
    };
    if (isDatabaseConfigured()) {
      try {
        const profile = await getOrCreateProfile(sessionUser.id, sessionUser.email, sessionUser.name, realUser.avatarColor);
        const consentStatus = await getLatestConsentStatus(sessionUser.id);
        realUser = {
          ...realUser,
          alias: profile.alias,
          fullName: profile.full_name,
          avatarColor: profile.avatar_color,
          hasConsented: consentStatus.hasCurrentConsent,
          consentVersion: consentStatus.latestVersion,
        };
      } catch (error) {
        unstable_rethrow(error);
        // Without the stored consent we cannot tell whether it is pending:
        // asking again would misrepresent an outage as a legal step.
        logError('home.account_state_failed', error);
        return <SessionUnavailable />;
      }
    }
    return (
      <RealDataProvider initialUser={realUser}>
        <RealAppShell />
      </RealDataProvider>
    );
  }

  // 3. Guest / Unauthenticated visitor sees Welcome screen
  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-app)' }}>
      <WelcomeView />
    </main>
  );
}

export default function Page(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="paper-loading" role="status">
          <strong>Abriendo Papelito…</strong>
        </div>
      }
    >
      <HomeContent searchParams={props.searchParams} />
    </Suspense>
  );
}
