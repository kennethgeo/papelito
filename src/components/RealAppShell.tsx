"use client";

import { useRealData } from "@/context/RealDataContext";
import { NavigationBottom } from "@/components/NavigationBottom";
import { RibbonLogo } from "@/components/RibbonLogo";
import { RibbonReveal } from "@/components/RibbonReveal";
import { CreateExchangeWizard } from "@/views/CreateExchangeWizard";
import { WishesListView } from "@/views/WishesListView";
import { ExchangesListView } from "@/views/ExchangesListView";
import { ExchangeDetailView } from "@/views/ExchangeDetailView";
import { AccountView } from "@/views/AccountView";
import { ConsentGateCard } from "@/components/ConsentGateCard";
import { ConnectionStatus } from "@/components/ConnectionStatus";

export function RealAppShell() {
  const data = useRealData();
  const { user, activeView, currentExchange, navigateTo, switchTab } = data;
  return (
    <div className="paper-app-shell">
      <a className="skip-link" href="#app-content">
        Ir al contenido
      </a>
      <header className="paper-header">
        <div className="paper-header-inner">
          <button
            className="brand-button"
            aria-label="Papelito, mis intercambios"
            onClick={() => switchTab("intercambios")}
          >
            <RibbonLogo size="sm" />
          </button>
          <button
            className="account-chip"
            onClick={() => switchTab("cuenta")}
            aria-label={`Mi cuenta, ${user?.alias ?? ""}`}
          >
            <span
              className="participant-avatar"
              style={{ background: user?.avatarColor }}
              aria-hidden="true"
            >
              {user?.alias?.slice(0, 1).toUpperCase()}
            </span>
            <span>{user?.alias}</span>
          </button>
        </div>
      </header>
      <ConnectionStatus />
      {data.errorMessage && (
        <div className="shell-notice workshop-error" role="alert">
          {data.errorMessage}
          <button
            className="paper-text-button"
            disabled={data.isRefreshing}
            onClick={() => void data.refreshNow()}
          >
            Actualizar información
          </button>
        </div>
      )}
      <main id="app-content" className="app-content">
        {activeView === "cuenta_perfil" ? (
          <AccountView />
        ) : !data.hasConsented ? (
          !data.isLoading && (
            <div className="consent-shell">
              <ConsentGateCard
                onConfirm={data.confirmConsent}
                onSecondaryAction={() => switchTab("cuenta")}
              />
            </div>
          )
        ) : (
          <>
            {activeView === "intercambios_lista" &&
              (data.isLoading && !data.lastSyncedAt ? (
                <div className="workshop-page loading-paper" role="status">
                  <h1>Buscando tus papelitos…</h1>
                  <p>Un momento mientras reunimos tus intercambios.</p>
                </div>
              ) : (
                <ExchangesListView />
              ))}
            {activeView === "intercambio_crear" && <CreateExchangeWizard />}
            {activeView === "intercambio_detalle" && <ExchangeDetailView />}
            {activeView === "asignacion_revelar" &&
              (currentExchange?.assignment ? (
                <div className="reveal-shell">
                  <RibbonReveal
                    assignment={currentExchange.assignment}
                    exchangeName={currentExchange.name}
                    onReveal={() => data.revealAssignment(currentExchange.id)}
                    onTogglePurchased={(id) =>
                      data.toggleWishPurchased(currentExchange.id, id)
                    }
                    onBack={() =>
                      navigateTo("intercambio_detalle", currentExchange.id)
                    }
                  />
                </div>
              ) : (
                <div className="workshop-page compact-page">
                  <section className="workshop-sheet">
                    <h1>
                      {data.isRefreshing
                        ? "Buscando tu papelito…"
                        : "Todavía no hay un papelito para abrir."}
                    </h1>
                    <p role="status">
                      {data.isRefreshing
                        ? "Estamos revisando tu asignación."
                        : "Volvé al intercambio para revisar el estado del sorteo."}
                    </p>
                    <button
                      className="paper-button"
                      onClick={() => navigateTo("intercambio_detalle")}
                    >
                      Volver al intercambio
                    </button>
                  </section>
                </div>
              ))}
            {activeView === "deseos_lista" && <WishesListView />}
          </>
        )}
      </main>
      <NavigationBottom activeTab={data.activeTab} onTabChange={switchTab} />
    </div>
  );
}
