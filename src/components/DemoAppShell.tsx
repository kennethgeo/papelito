"use client";

import React from "react";
import { useDemoData } from "@/context/DemoDataContext";
import { DemoHeader } from "@/components/DemoHeader";
import { NavigationBottom } from "@/components/NavigationBottom";
import { WelcomeView } from "@/views/WelcomeView";
import { ExchangesListView } from "@/views/ExchangesListView";
import { CreateExchangeWizard } from "@/views/CreateExchangeWizard";
import { ExchangeDetailView } from "@/views/ExchangeDetailView";
import { RibbonReveal } from "@/components/RibbonReveal";
import { WishesListView } from "@/views/WishesListView";
import { AccountView } from "@/views/AccountView";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { ContextualGuide } from './ContextualGuide';

export function DemoAppShell() {
  const {
    activeView,
    activeTab,
    switchTab,
    navigateTo,
    currentExchange,
    revealAssignment,
    toggleWishPurchased,
    isHydrated,
  } = useDemoData();

  if (!isHydrated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-app)",
          fontFamily: "var(--font-heading)",
          color: "var(--color-tinta)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎀</div>
          <strong>Cargando demostración...</strong>
        </div>
      </div>
    );
  }

  if (activeView === "bienvenida") {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "var(--bg-app)" }}>
        <WelcomeView />
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-app)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <DemoHeader onLogoClick={() => navigateTo("intercambios_lista")} />
      <ConnectionStatus />

      <main style={{ flex: 1 }}>
        <ContextualGuide />
        {activeView === "intercambios_lista" && <ExchangesListView />}
        {activeView === "intercambio_crear" && <CreateExchangeWizard />}
        {activeView === "intercambio_detalle" && <ExchangeDetailView />}
        {activeView === "asignacion_revelar" &&
          currentExchange &&
          currentExchange.assignment && (
            <div
              style={{ maxWidth: "560px", margin: "0 auto", padding: "0 1rem" }}
            >
              <RibbonReveal
                assignment={currentExchange.assignment}
                exchangeName={currentExchange.name}
                onReveal={() => revealAssignment(currentExchange.id)}
                onTogglePurchased={(wishId) =>
                  toggleWishPurchased(currentExchange.id, wishId)
                }
                onBack={() =>
                  navigateTo("intercambio_detalle", currentExchange.id)
                }
              />
            </div>
          )}
        {activeView === "deseos_lista" && <WishesListView />}
        {activeView === "cuenta_perfil" && <AccountView />}
      </main>

      <NavigationBottom activeTab={activeTab} onTabChange={switchTab} />
    </div>
  );
}
