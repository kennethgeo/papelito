'use client';

import React from 'react';
import { useRealData } from '@/context/RealDataContext';
import { NavigationBottom } from '@/components/NavigationBottom';
import { RibbonLogo } from '@/components/RibbonLogo';
import { RibbonReveal } from '@/components/RibbonReveal';
import { CreateExchangeWizard } from '@/views/CreateExchangeWizard';
import { WishesListView } from '@/views/WishesListView';
import { ExchangesListView } from '@/views/ExchangesListView';
import { ExchangeDetailView } from '@/views/ExchangeDetailView';
import { AccountView } from '@/views/AccountView';
import { ConsentGateCard } from '@/components/ConsentGateCard';

export function RealAppShell() {
  const {
    user,
    hasConsented,
    exchanges,
    currentExchange,
    activeTab,
    activeView,
    switchTab,
    navigateTo,
    revealAssignment,
    toggleWishPurchased,
    confirmConsent,
    isLoading,
    errorMessage,
  } = useRealData();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header for Real Authenticated Session */}
      <header
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.75rem 1rem',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '680px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            onClick={() => navigateTo('intercambios_lista')}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <RibbonLogo size="sm" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {user && (
              <div
                onClick={() => switchTab('cuenta')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '999px',
                  backgroundColor: 'var(--surface-subtle)',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: user.avatarColor || 'var(--color-tinta)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  {user.alias ? user.alias.charAt(0).toUpperCase() : 'U'}
                </div>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--color-tinta)',
                  }}
                >
                  {user.alias}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          style={{
            maxWidth: '680px',
            margin: '1rem auto 0 auto',
            width: 'calc(100% - 2rem)',
            backgroundColor: '#FFF5F5',
            border: '1px solid #FEB2B2',
            color: '#9B1C1C',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            fontSize: '0.88rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '0.9rem' }}>Sincronizando con el servidor...</span>
        </div>
      )}

      {/* Main views: Account & Privacy tab is ALWAYS accessible even without active consent */}
      <main style={{ flex: 1, paddingBottom: '5rem' }}>
        {activeView === 'cuenta_perfil' ? (
          <AccountView />
        ) : !hasConsented ? (
          !isLoading ? (
            <div style={{ padding: '0 1rem' }}>
              <ConsentGateCard
                onConfirm={confirmConsent}
                onSecondaryAction={() => switchTab('cuenta')}
              />
            </div>
          ) : null
        ) : (
          <>
            {activeView === 'intercambios_lista' && (
              exchanges.length === 0 && !isLoading ? (
                <div
                  style={{
                    maxWidth: '480px',
                    margin: '3rem auto',
                    padding: '2rem 1.5rem',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '24px',
                    border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                    boxShadow: '0 8px 30px rgba(70, 36, 93, 0.05)',
                  }}
                >
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎁</div>
                  <h2
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      color: 'var(--color-tinta)',
                      margin: '0 0 0.5rem 0',
                    }}
                  >
                    No tienes intercambios activos
                  </h2>
                  <p
                    style={{
                      fontSize: '0.9rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      margin: '0 0 1.5rem 0',
                    }}
                  >
                    Comienza creando tu propio intercambio con tema y presupuesto para invitar a tus amigos o familiares.
                  </p>
                  <button
                    onClick={() => navigateTo('intercambio_crear')}
                    style={{
                      minHeight: '48px',
                      backgroundColor: 'var(--color-frambuesa)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.75rem 1.5rem',
                      fontSize: '0.96rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-heading)',
                    }}
                  >
                    + Crear mi primer intercambio
                  </button>
                </div>
              ) : (
                <ExchangesListView />
              )
            )}

            {activeView === 'intercambio_crear' && <CreateExchangeWizard />}
            {activeView === 'intercambio_detalle' && <ExchangeDetailView />}

            {activeView === 'asignacion_revelar' && currentExchange?.assignment && (
              <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1rem' }}>
                <RibbonReveal
                  assignment={currentExchange.assignment}
                  exchangeName={currentExchange.name}
                  onReveal={() => revealAssignment(currentExchange.id)}
                  onTogglePurchased={(wishId) => toggleWishPurchased(currentExchange.id, wishId)}
                  onBack={() => navigateTo('intercambio_detalle', currentExchange.id)}
                />
              </div>
            )}

            {activeView === 'deseos_lista' && <WishesListView />}
          </>
        )}
      </main>

      <NavigationBottom activeTab={activeTab} onTabChange={switchTab} />
    </div>
  );
}
