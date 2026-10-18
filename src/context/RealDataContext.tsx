"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  getAppSnapshotAction,
  createExchangeAction,
  regenerateInvitationAction,
  triggerDrawAction,
  manageMemberStatusAction,
  updateExchangeThemeAction,
  setExchangeExclusionsAction,
  revealAssignmentAction,
  toggleWishPurchaseAction,
  saveWishAction,
  deleteWishAction,
  toggleWishInExchangeAction,
  updateProfileAliasAction,
  recordConsentAction,
  revokeConsentAction,
  submitPrivacyRequestAction,
  exportUserDataAction,
  updateExchangeLifecycleStatusAction,
  transferExchangeOrganizerAction,
  getAccountDeletionImpactAction,
  requestAccountDeletionAction,
} from "@/lib/data/server-actions";
import type {
  AccountDeletionImpact,
  RequestAccountDeletionResult,
} from "@/lib/repositories/profiles";
import { callServerAction } from "@/lib/client-actions";
import type { AppSnapshot } from "@/lib/repositories/app-snapshot";
import { LEGAL_CONSTANTS } from "@/lib/legal/constants";
import {
  Exchange,
  Wish,
  ThemeKey,
  Currency,
  ExchangeStatus,
  Assignment,
} from "@/types";

export type NavigationTab = "intercambios" | "deseos" | "cuenta";
export type AppView =
  | "intercambios_lista"
  | "intercambio_crear"
  | "intercambio_detalle"
  | "asignacion_revelar"
  | "deseos_lista"
  | "cuenta_perfil";

export interface RealUser {
  id: string;
  email: string;
  alias: string;
  fullName: string;
  avatarColor: string;
  hasConsented?: boolean;
  consentVersion?: string | null;
}

interface RealDataContextType {
  user: RealUser | null;
  hasConsented: boolean;
  consentVersion: string | null;
  exchanges: Exchange[];
  currentExchange: Exchange | null;
  currentAssignment: Assignment | null;
  myWishes: Wish[];
  activeTab: NavigationTab;
  activeView: AppView;
  isLoading: boolean;
  isRefreshing: boolean;
  lastSyncedAt: string | null;
  refreshNow: () => Promise<boolean>;
  errorMessage: string | null;
  switchTab: (tab: NavigationTab) => void;
  navigateTo: (view: AppView, exchangeId?: string) => void;
  createExchange: (data: {
    name: string;
    description?: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
    currency: "CRC" | "USD";
    suggestedTheme: "navidad" | "amistad" | "cumpleanos" | "general";
    selectedTheme: "navidad" | "amistad" | "cumpleanos" | "general";
    requiresApproval: boolean;
  }) => Promise<{ success: boolean; exchangeId?: string; error?: string }>;
  manageMember: (
    targetUserId: string,
    newStatus: "approved" | "rejected",
  ) => Promise<boolean>;
  updateExchangeTheme: (
    exchangeId: string,
    newTheme: ThemeKey,
  ) => Promise<boolean>;
  updateExchangeLifecycle: (
    exchangeId: string,
    nextStatus: "finalizado" | "cancelado",
  ) => Promise<{ success: boolean; error?: string }>;
  transferExchangeOrganizer: (
    exchangeId: string,
    newOrganizerUserId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  saveExclusions: (
    exchangeId: string,
    rules: Array<{ giverUserId: string; excludedReceiverUserId: string }>,
  ) => Promise<boolean>;
  regenerateInviteLink: (exchangeId: string) => Promise<string | null>;
  executeDraw: (
    exchangeId: string,
    invalidationReason?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  revealAssignment: (exchangeId: string) => Promise<boolean>;
  toggleWishPurchased: (exchangeId: string, wishId: string) => Promise<boolean>;
  saveWish: (wish: {
    id?: string;
    title: string;
    description?: string;
    url?: string;
    approximatePrice?: number;
    currency?: "CRC" | "USD";
    priority?: "alta" | "media" | "baja";
  }) => Promise<boolean>;
  deleteWish: (wishId: string) => Promise<boolean>;
  toggleWishInExchange: (
    exchangeId: string,
    wishId: string,
    selected: boolean,
  ) => Promise<boolean>;
  updateUserAlias: (newAlias: string) => Promise<boolean>;
  confirmConsent: (
    termsAccepted: boolean,
    privacyAccepted: boolean,
  ) => Promise<boolean>;
  revokeUserConsent: () => Promise<boolean>;
  submitPrivacyRequest: (
    type: "export" | "delete",
    notes?: string,
  ) => Promise<boolean>;
  getAccountDeletionImpact: () => Promise<AccountDeletionImpact | null>;
  requestAccountDeletion: (input: {
    confirmPhrase: string;
    confirmIrreversible: boolean;
    confirmOrganizerImpact?: boolean;
    notes?: string;
  }) => Promise<{
    success: boolean;
    data?: RequestAccountDeletionResult;
    error?: string;
  }>;
  exportAllUserData: () => Promise<Record<string, unknown> | null>;
  reloadExchanges: () => Promise<void>;
  reloadWishes: () => Promise<void>;
}

const RealDataContext = createContext<RealDataContextType | null>(null);

export function RealDataProvider({
  initialUser,
  children,
}: {
  initialUser: RealUser;
  children: ReactNode;
}) {
  const [user, setUser] = useState<RealUser>(initialUser);
  const [hasConsented, setHasConsented] = useState<boolean>(
    initialUser.hasConsented ?? false,
  );
  const [consentVersion, setConsentVersion] = useState<string | null>(
    initialUser.consentVersion ?? null,
  );
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(
    null,
  );
  const [currentExchange, setCurrentExchange] = useState<Exchange | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(
    null,
  );
  const [myWishes, setMyWishes] = useState<Wish[]>([]);
  const [activeTab, setActiveTab] = useState<NavigationTab>("intercambios");
  const [activeView, setActiveView] = useState<AppView>("intercambios_lista");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const initialDeepLink = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const lastRefresh = useRef(0);
  const inFlightRefresh = useRef<{
    key: string | null;
    promise: Promise<boolean>;
  } | null>(null);

  const clearClientPendingConsentCookie = () => {
    if (typeof document !== "undefined") {
      document.cookie =
        "papelito_pending_consent=; path=/; max-age=0; SameSite=Lax";
    }
  };

  const applySnapshot = useCallback((data: AppSnapshot) => {
    setHasConsented(data.consent.hasCurrentConsent);
    setConsentVersion(data.consent.latestVersion);
    clearClientPendingConsentCookie();
    setExchanges(
      data.exchanges.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        eventDate: item.eventDate,
        registrationDeadline: item.registrationDeadline,
        timezone: "America/Costa_Rica",
        budgetAmount: item.budgetAmount,
        currency: item.currency as Currency,
        status: item.status as ExchangeStatus,
        selectedTheme: item.theme as ThemeKey,
        suggestedTheme: item.suggestedTheme as ThemeKey,
        organizerName: item.organizerAlias,
        isCurrentUserOrganizer: item.isOrganizer,
        inviteCode: "",
        requiresApproval: item.requiresApproval,
        minParticipants: item.minParticipants,
        currentDrawVersion: item.currentDrawVersion,
        closedAt: item.closedAt,
        currentUserMemberStatus: item.memberStatus,
        participantCount: item.participantCount,
        participants: [],
      })),
    );
    setMyWishes(data.wishes);
    if (data.selected) {
      const { details, assignment } = data.selected;
      const ex = details.exchange;
      const participants = details.participants.map((p) => ({
        id: p.userId,
        alias: p.alias,
        avatarColor: p.avatarColor,
        isOrganizer: p.isOrganizer,
        isReady: p.wishCount > 0,
        joinedAt: p.joinedAt,
        wishCount: p.wishCount,
        status: p.status,
      }));
      setCurrentExchange({
        id: ex.id,
        name: ex.name,
        description: ex.description,
        eventDate: ex.eventDate,
        registrationDeadline: ex.registrationDeadline,
        timezone: "America/Costa_Rica",
        budgetAmount: ex.budgetAmount,
        currency: ex.currency as Currency,
        status: ex.status as ExchangeStatus,
        suggestedTheme: ex.suggestedTheme as ThemeKey,
        selectedTheme: ex.selectedTheme as ThemeKey,
        manualThemeOverride: ex.manualThemeOverride as ThemeKey | undefined,
        organizerName: ex.organizerAlias,
        isCurrentUserOrganizer: ex.isCurrentUserOrganizer,
        inviteCode: details.invitationToken || "",
        requiresApproval: ex.requiresApproval,
        minParticipants: ex.minParticipants,
        currentDrawVersion: ex.currentDrawVersion,
        closedAt: ex.closedAt,
        drawNotice: "drawNotice" in ex ? ex.drawNotice : null,
        currentUserMemberStatus: ex.currentUserMemberStatus,
        participantCount: participants.filter((p) => p.status === "approved")
          .length,
        participants,
        exclusions: details.exclusions,
        assignment: assignment ?? undefined,
      });
      setCurrentAssignment(assignment);
    } else {
      setCurrentExchange(null);
      setCurrentAssignment(null);
    }
    if (!data.consent.hasCurrentConsent) {
      selectedRef.current = null;
      setSelectedExchangeId(null);
    }
    setErrorMessage(data.detailError);
  }, []);

  const refreshApp = useCallback(
    (force = false): Promise<boolean> => {
      const key = selectedRef.current;
      if (!force && inFlightRefresh.current?.key === key)
        return inFlightRefresh.current.promise;
      const version = ++requestVersion.current;
      setIsRefreshing(true);
      const promise = (async () => {
        try {
          const result = await callServerAction(() =>
            getAppSnapshotAction(key ?? undefined),
          );
          if (version !== requestVersion.current) return false;
          if (!result.success || !result.data) {
            setErrorMessage(
              result.error || "No pudimos actualizar. Intentá de nuevo.",
            );
            return false;
          }
          applySnapshot(result.data);
          lastRefresh.current = Date.now();
          setLastSyncedAt(new Date().toISOString());
          return true;
        } finally {
          if (version === requestVersion.current) {
            setIsLoading(false);
            setIsRefreshing(false);
            inFlightRefresh.current = null;
          }
        }
      })();
      inFlightRefresh.current = { key, promise };
      return promise;
    },
    [applySnapshot],
  );
  const reloadExchanges = useCallback(async () => {
    await refreshApp(true);
  }, [refreshApp]);
  const reloadWishes = reloadExchanges;
  const loadExchangeDetails = useCallback(
    async (id: string) => {
      selectedRef.current = id;
      await refreshApp(true);
    },
    [refreshApp],
  );

  useEffect(() => {
    let active = true;
    const deepLink =
      new URLSearchParams(window.location.search).get("intercambio") ??
      initialDeepLink.current;
    if (
      deepLink &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        deepLink,
      )
    ) {
      selectedRef.current = deepLink;
      initialDeepLink.current = deepLink;
      queueMicrotask(() => {
        if (active) {
          setSelectedExchangeId(deepLink);
          setActiveView("intercambio_detalle");
        }
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("intercambio");
      window.history.replaceState(null, "", url);
    }
    queueMicrotask(() => {
      if (active) void refreshApp();
    });
    const refreshOnReturn = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        Date.now() - lastRefresh.current >= 30_000
      )
        void refreshApp();
    };
    const refreshOnline = () => {
      if (document.visibilityState === "visible") void refreshApp();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("online", refreshOnline);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("online", refreshOnline);
    };
  }, [refreshApp]);

  const switchTab = (tab: NavigationTab) => {
    setErrorMessage(null);
    setActiveTab(tab);
    if (tab === "intercambios") setActiveView("intercambios_lista");
    else if (tab === "deseos") setActiveView("deseos_lista");
    else if (tab === "cuenta") setActiveView("cuenta_perfil");
    window.scrollTo({ top: 0 });
  };

  const navigateTo = (view: AppView, exchangeId?: string) => {
    setErrorMessage(null);
    setActiveView(view);
    if (view.startsWith("intercambio") || view === "asignacion_revelar")
      setActiveTab("intercambios");
    else if (view === "deseos_lista") setActiveTab("deseos");
    else if (view === "cuenta_perfil") setActiveTab("cuenta");
    if (exchangeId) {
      if (exchangeId !== selectedExchangeId) {
        setCurrentExchange(null);
        setCurrentAssignment(null);
      }
      setSelectedExchangeId(exchangeId);
      selectedRef.current = exchangeId;
      void refreshApp();
    }
    window.scrollTo({ top: 0 });
  };

  const createExchange = async (data: {
    name: string;
    description?: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
    currency: "CRC" | "USD";
    suggestedTheme: "navidad" | "amistad" | "cumpleanos" | "general";
    selectedTheme: "navidad" | "amistad" | "cumpleanos" | "general";
    requiresApproval: boolean;
  }) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await callServerAction(() => createExchangeAction(data));
      if (res.success && res.data) {
        setCurrentExchange(null);
        setCurrentAssignment(null);
        setSelectedExchangeId(res.data.exchangeId);
        selectedRef.current = res.data.exchangeId;
        await refreshApp(true);
        setActiveView("intercambio_detalle");
        return { success: true, exchangeId: res.data.exchangeId };
      }
      return {
        success: false,
        error: res.error || "Error al crear intercambio",
      };
    } catch {
      return { success: false, error: "Excepción de red al crear intercambio" };
    } finally {
      setIsLoading(false);
    }
  };

  const manageMember = async (
    targetUserId: string,
    newStatus: "approved" | "rejected",
  ) => {
    if (!selectedExchangeId) return false;
    setErrorMessage(null);
    const res = await callServerAction(() =>
      manageMemberStatusAction(selectedExchangeId, targetUserId, newStatus),
    );
    if (res.success) {
      await loadExchangeDetails(selectedExchangeId);
      return true;
    }
    setErrorMessage(res.error || "Error al gestionar participante");
    return false;
  };

  const updateExchangeThemeHandler = async (
    exchangeId: string,
    newTheme: ThemeKey,
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      updateExchangeThemeAction(exchangeId, newTheme),
    );
    if (res.success) {
      await loadExchangeDetails(exchangeId);
      return true;
    }
    setErrorMessage(res.error || "Error al cambiar el tema del intercambio.");
    return false;
  };

  const updateExchangeLifecycleHandler = async (
    exchangeId: string,
    nextStatus: "finalizado" | "cancelado",
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      updateExchangeLifecycleStatusAction(exchangeId, nextStatus),
    );
    if (res.success) {
      await refreshApp(true);
      return { success: true };
    }
    return {
      success: false,
      error: res.error || "No se pudo actualizar el estado del intercambio.",
    };
  };

  const transferExchangeOrganizerHandler = async (
    exchangeId: string,
    newOrganizerUserId: string,
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      transferExchangeOrganizerAction(exchangeId, newOrganizerUserId),
    );
    if (res.success) {
      await refreshApp(true);
      return { success: true };
    }
    return {
      success: false,
      error:
        res.error || "No se pudo transferir la organización del intercambio.",
    };
  };

  const saveExclusionsHandler = async (
    exchangeId: string,
    rules: Array<{ giverUserId: string; excludedReceiverUserId: string }>,
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      setExchangeExclusionsAction(exchangeId, rules),
    );
    if (res.success) {
      await loadExchangeDetails(exchangeId);
      return true;
    }
    setErrorMessage(
      res.error || "Error al guardar las restricciones del sorteo.",
    );
    return false;
  };

  const regenerateInviteLinkHandler = async (exchangeId: string) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      regenerateInvitationAction(exchangeId),
    );
    if (res.success && res.data?.inviteToken) {
      await loadExchangeDetails(exchangeId);
      return res.data.inviteToken;
    }
    setErrorMessage(res.error || "No se pudo renovar el enlace de invitación.");
    return null;
  };

  const executeDrawHandler = async (
    exchangeId: string,
    invalidationReason?: string,
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const expectedVersion =
        currentExchange && currentExchange.id === exchangeId
          ? (currentExchange.currentDrawVersion ?? 0)
          : 0;
      const res = await callServerAction(() =>
        triggerDrawAction(exchangeId, expectedVersion, invalidationReason),
      );
      if (res.success) {
        await loadExchangeDetails(exchangeId);
        return { success: true };
      }
      return { success: false, error: res.error };
    } catch {
      return { success: false, error: "Error al ejecutar sorteo." };
    } finally {
      setIsLoading(false);
    }
  };

  const revealAssignmentHandler = async (exchangeId: string) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      revealAssignmentAction(exchangeId),
    );
    if (res.success) {
      await loadExchangeDetails(exchangeId);
      return true;
    }
    setErrorMessage(res.error || "No se pudo revelar la asignación.");
    return false;
  };

  const toggleWishPurchased = async (exchangeId: string, wishId: string) => {
    if (!currentAssignment) return false;
    setErrorMessage(null);
    const targetWish = currentAssignment.wishes.find((w) => w.id === wishId);
    const currentlyPurchased = targetWish?.isPurchasedByGiver || false;

    const res = await callServerAction(() =>
      toggleWishPurchaseAction(exchangeId, wishId, !currentlyPurchased),
    );
    if (res.success) {
      setCurrentAssignment((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          wishes: prev.wishes.map((w) =>
            w.id === wishId
              ? {
                  ...w,
                  isPurchasedByGiver: !currentlyPurchased,
                  isPurchased: !currentlyPurchased,
                }
              : w,
          ),
        };
      });
      setCurrentExchange((prev) => {
        if (!prev || !prev.assignment) return prev;
        return {
          ...prev,
          assignment: {
            ...prev.assignment,
            wishes: prev.assignment.wishes.map((w) =>
              w.id === wishId
                ? {
                    ...w,
                    isPurchasedByGiver: !currentlyPurchased,
                    isPurchased: !currentlyPurchased,
                  }
                : w,
            ),
          },
        };
      });
      // Supersede any snapshot that began before the purchase was confirmed.
      await loadExchangeDetails(exchangeId);
      return true;
    }
    setErrorMessage(res.error || "No se pudo actualizar la marca de compra.");
    return false;
  };

  const saveWishHandler = async (wish: {
    id?: string;
    title: string;
    description?: string;
    url?: string;
    approximatePrice?: number;
    currency?: "CRC" | "USD";
    priority?: "alta" | "media" | "baja";
  }) => {
    setErrorMessage(null);
    const res = await callServerAction(() => saveWishAction(wish));
    if (res.success) {
      await reloadWishes();
      return true;
    }
    setErrorMessage(res.error || "Error al guardar deseo");
    return false;
  };

  const deleteWishHandler = async (wishId: string) => {
    setErrorMessage(null);
    const res = await callServerAction(() => deleteWishAction(wishId));
    if (res.success) {
      await reloadWishes();
      return true;
    }
    setErrorMessage(res.error || "Error al eliminar deseo");
    return false;
  };

  const toggleWishInExchange = async (
    exchangeId: string,
    wishId: string,
    selected: boolean,
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      toggleWishInExchangeAction(exchangeId, wishId, selected),
    );
    if (res.success) {
      await refreshApp(true);
      return true;
    }
    setErrorMessage(
      res.error ||
        "No se pudo actualizar la selección del deseo para el intercambio.",
    );
    return false;
  };

  const updateUserAlias = async (newAlias: string) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      updateProfileAliasAction(newAlias),
    );
    if (res.success) {
      setUser((prev) => ({ ...prev, alias: newAlias }));
      return true;
    }
    setErrorMessage(res.error || "Error al actualizar alias");
    return false;
  };

  const confirmConsentHandler = async (
    termsAccepted: boolean,
    privacyAccepted: boolean,
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      recordConsentAction({
        termsAccepted,
        privacyAccepted,
        version: LEGAL_CONSTANTS.VERSION,
      }),
    );
    clearClientPendingConsentCookie();
    if (res.success) {
      setHasConsented(true);
      setConsentVersion(LEGAL_CONSTANTS.VERSION);
      await refreshApp(true);
      return true;
    }
    setErrorMessage(res.error || "No se pudo registrar el consentimiento.");
    return false;
  };

  const revokeUserConsentHandler = async () => {
    setErrorMessage(null);
    clearClientPendingConsentCookie();
    const res = await callServerAction(() => revokeConsentAction());
    if (res.success) {
      setHasConsented(false);
      setConsentVersion(null);
      setExchanges([]);
      setMyWishes([]);
      setCurrentExchange(null);
      setCurrentAssignment(null);
      setSelectedExchangeId(null);
      selectedRef.current = null;
      return true;
    }
    setErrorMessage(res.error || "No se pudo revocar el consentimiento.");
    return false;
  };

  const submitPrivacyRequestHandler = async (
    type: "export" | "delete",
    notes?: string,
  ) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      submitPrivacyRequestAction(type, notes),
    );
    if (!res.success) {
      setErrorMessage(
        res.error || "Error al registrar la solicitud de privacidad.",
      );
    }
    return res.success;
  };

  const getAccountDeletionImpactHandler = useCallback(async () => {
    const res = await callServerAction(() => getAccountDeletionImpactAction());
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  }, []);

  const requestAccountDeletionHandler = async (input: {
    confirmPhrase: string;
    confirmIrreversible: boolean;
    confirmOrganizerImpact?: boolean;
    notes?: string;
  }) => {
    setErrorMessage(null);
    const res = await callServerAction(() =>
      requestAccountDeletionAction(input),
    );
    if (res.success && res.data) {
      await reloadExchanges();
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error:
        res.error ||
        "No se pudo registrar la solicitud de eliminación de cuenta.",
    };
  };

  const exportAllUserDataHandler = async () => {
    setErrorMessage(null);
    const res = await callServerAction(() => exportUserDataAction());
    if (res.success && res.data) {
      return res.data as Record<string, unknown>;
    }
    throw new Error(res.error || "Error al exportar datos");
  };

  return (
    <RealDataContext.Provider
      value={{
        user,
        hasConsented,
        consentVersion,
        exchanges,
        currentExchange,
        currentAssignment,
        myWishes,
        activeTab,
        activeView,
        isLoading,
        isRefreshing,
        lastSyncedAt,
        refreshNow: () => refreshApp(true),
        errorMessage,
        switchTab,
        navigateTo,
        createExchange,
        manageMember,
        updateExchangeTheme: updateExchangeThemeHandler,
        updateExchangeLifecycle: updateExchangeLifecycleHandler,
        transferExchangeOrganizer: transferExchangeOrganizerHandler,
        saveExclusions: saveExclusionsHandler,
        regenerateInviteLink: regenerateInviteLinkHandler,
        executeDraw: executeDrawHandler,
        revealAssignment: revealAssignmentHandler,
        toggleWishPurchased,
        saveWish: saveWishHandler,
        deleteWish: deleteWishHandler,
        toggleWishInExchange,
        updateUserAlias,
        confirmConsent: confirmConsentHandler,
        revokeUserConsent: revokeUserConsentHandler,
        submitPrivacyRequest: submitPrivacyRequestHandler,
        getAccountDeletionImpact: getAccountDeletionImpactHandler,
        requestAccountDeletion: requestAccountDeletionHandler,
        exportAllUserData: exportAllUserDataHandler,
        reloadExchanges,
        reloadWishes,
      }}
    >
      {children}
    </RealDataContext.Provider>
  );
}

export function useRealData() {
  const context = useContext(RealDataContext);
  if (!context) {
    throw new Error("useRealData debe usarse dentro de un RealDataProvider");
  }
  return context;
}

export function useOptionalRealData() {
  return useContext(RealDataContext);
}
