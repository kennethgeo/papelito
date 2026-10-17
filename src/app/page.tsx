import React, { Suspense } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { isNeonAuthConfigured } from '@/lib/auth/config';
import { getServerSession } from '@/lib/auth/server';
import { isDatabaseConfigured } from '@/lib/db/client';
import { getOrCreateProfile, getLatestConsentStatus } from '@/lib/repositories/profiles';
import { RealDataProvider, RealUser } from '@/context/RealDataContext';
import { RealAppShell } from '@/components/RealAppShell';
import { DemoDataProvider } from '@/context/DemoDataContext';
import { DemoAppShell } from '@/components/DemoAppShell';
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

  // 2. Check for real authenticated session if backend credentials are configured
  let realUser: RealUser | null = null;
  if (isNeonAuthConfigured()) {
    try {
      const session = await getServerSession();
      if (session?.user) {
        let alias = session.user.name || session.user.email?.split('@')[0] || 'Participante';
        let fullName = session.user.name || session.user.email || 'Participante';
        let avatarColor = session.user.avatarColor || '#46245D';
        let hasConsented = false;
        let consentVersion: string | null = null;

        if (isDatabaseConfigured()) {
          try {
            const profile = await getOrCreateProfile(
              session.user.id,
              session.user.email,
              session.user.name,
              avatarColor
            );
            alias = profile.alias;
            fullName = profile.full_name;
            avatarColor = profile.avatar_color;

            const consentStatus = await getLatestConsentStatus(session.user.id);
            hasConsented = consentStatus.hasCurrentConsent;
            consentVersion = consentStatus.latestVersion;
          } catch (dbErr) {
            unstable_rethrow(dbErr);
            // Fall back to session metadata if DB is momentarily unreachable
          }
        }

        realUser = {
          id: session.user.id,
          email: session.user.email || '',
          alias,
          fullName,
          avatarColor,
          hasConsented,
          consentVersion,
        };
      }
    } catch (err) {
      unstable_rethrow(err);
      // In case of network / session error, treat as guest
    }
  }

  // 3. Authenticated user enters Real connected dashboard
  if (realUser) {
    return (
      <RealDataProvider initialUser={realUser}>
        <RealAppShell />
      </RealDataProvider>
    );
  }

  // 4. Guest / Unauthenticated visitor sees Welcome screen
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
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-app)',
            fontFamily: 'var(--font-heading)',
            color: 'var(--color-tinta)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎁</div>
            <strong>Cargando Papelito...</strong>
          </div>
        </div>
      }
    >
      <HomeContent searchParams={props.searchParams} />
    </Suspense>
  );
}
