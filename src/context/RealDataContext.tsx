'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  createExchangeAction,
  regenerateInvitationAction,
  getMyExchangesAction,
  getExchangeDetailsAction,
  triggerDrawAction,
  manageMemberStatusAction,
  updateExchangeThemeAction,
  setExchangeExclusionsAction,
  getMyAssignmentAction,
  revealAssignmentAction,
  toggleWishPurchaseAction,
  getMyWishesAction,
  saveWishAction,
  deleteWishAction,
  toggleWishInExchangeAction,
  updateProfileAliasAction,
  getConsentStatusAction,
  recordConsentAction,
  revokeConsentAction,
  submitPrivacyRequestAction,
  exportUserDataAction,
} from '@/lib/data/server-actions';
import { LEGAL_CONSTANTS } from '@/lib/legal/constants';
import {
  Exchange,
  Wish,
  ThemeKey,
  Currency,
  ExchangeStatus,
  Assignment,
} from '@/types';

export type NavigationTab = 'intercambios' | 'deseos' | 'cuenta';
export type AppView =
  | 'intercambios_lista'
  | 'intercambio_crear'
  | 'intercambio_detalle'
  | 'asignacion_revelar'
  | 'deseos_lista'
  | 'cuenta_perfil';

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
  errorMessage: string | null;
  switchTab: (tab: NavigationTab) => void;
  navigateTo: (view: AppView, exchangeId?: string) => void;
  createExchange: (data: {
    name: string;
    description?: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
    currency: 'CRC' | 'USD';
    suggestedTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general';
    selectedTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general';
    requiresApproval: boolean;
  }) => Promise<{ success: boolean; exchangeId?: string; error?: string }>;
  manageMember: (targetUserId: string, newStatus: 'approved' | 'rejected') => Promise<boolean>;
  updateExchangeTheme: (exchangeId: string, newTheme: ThemeKey) => Promise<boolean>;
  saveExclusions: (
    exchangeId: string,
    rules: Array<{ giverUserId: string; excludedReceiverUserId: string }>
  ) => Promise<boolean>;
  regenerateInviteLink: (exchangeId: string) => Promise<string | null>;
  executeDraw: (exchangeId: string, invalidationReason?: string) => Promise<{ success: boolean; error?: string }>;
  revealAssignment: (exchangeId: string) => Promise<boolean>;
  toggleWishPurchased: (exchangeId: string, wishId: string) => Promise<boolean>;
  saveWish: (wish: {
    id?: string;
    title: string;
    description?: string;
    url?: string;
    approximatePrice?: number;
    currency?: 'CRC' | 'USD';
    priority?: 'alta' | 'media' | 'baja';
  }) => Promise<boolean>;
  deleteWish: (wishId: string) => Promise<boolean>;
  toggleWishInExchange: (exchangeId: string, wishId: string, selected: boolean) => Promise<boolean>;
  updateUserAlias: (newAlias: string) => Promise<boolean>;
  confirmConsent: (termsAccepted: boolean, privacyAccepted: boolean) => Promise<boolean>;
  revokeUserConsent: () => Promise<boolean>;
  submitPrivacyRequest: (type: 'export' | 'delete', notes?: string) => Promise<boolean>;
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
  const [hasConsented, setHasConsented] = useState<boolean>(initialUser.hasConsented ?? false);
  const [consentVersion, setConsentVersion] = useState<string | null>(initialUser.consentVersion ?? null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(null);
  const [currentExchange, setCurrentExchange] = useState<Exchange | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [myWishes, setMyWishes] = useState<Wish[]>([]);
  const [activeTab, setActiveTab] = useState<NavigationTab>('intercambios');
  const [activeView, setActiveView] = useState<AppView>('intercambios_lista');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearClientPendingConsentCookie = () => {
    if (typeof document !== 'undefined') {
      document.cookie = 'papelito_pending_consent=; path=/; max-age=0; SameSite=Lax';
    }
  };

  const reloadConsent = useCallback(async () => {
    try {
      const res = await getConsentStatusAction();
      clearClientPendingConsentCookie();
      if (res.success && res.data) {
        setHasConsented(res.data.hasCurrentConsent);
        setConsentVersion(res.data.latestVersion);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // 1. Load user's exchange list
  const reloadExchanges = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getMyExchangesAction();
      if (res.success && res.data) {
        const mapped: Exchange[] = res.data.map((item) => {
          const theme: ThemeKey = (['navidad', 'amistad', 'cumpleanos', 'general'].includes(item.theme)
            ? item.theme
            : 'general') as ThemeKey;
          const suggested: ThemeKey = (['navidad', 'amistad', 'cumpleanos', 'general'].includes(item.suggestedTheme)
            ? item.suggestedTheme
            : theme) as ThemeKey;
          return {
            id: item.id,
            name: item.name,
            description: item.description,
            eventDate: item.eventDate,
            registrationDeadline: item.registrationDeadline,
            timezone: 'America/Costa_Rica',
            budgetAmount: item.budgetAmount,
            currency: item.currency as Currency,
            status: item.status as ExchangeStatus,
            suggestedTheme: suggested,
            selectedTheme: theme,
            organizerName: item.organizerAlias || 'Organizador',
            isCurrentUserOrganizer: item.isOrganizer,
            inviteCode: '',
            requiresApproval: item.requiresApproval,
            minParticipants: item.minParticipants || 3,
            currentDrawVersion: item.currentDrawVersion || 0,
            currentUserMemberStatus: item.memberStatus,
            participantCount: item.participantCount ?? 0,
            participants: [],
          };
        });
        setExchanges(mapped);
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch {
      setErrorMessage('Error al sincronizar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Load user's personal wishes
  const reloadWishes = useCallback(async () => {
    try {
      const res = await getMyWishesAction();
      if (res.success && res.data) {
        setMyWishes(res.data);
      }
    } catch {
      // Non-fatal on background wish reload
    }
  }, []);

  // 3. Load full details for selected exchange
  const loadExchangeDetails = useCallback(async (exchangeId: string) => {
    try {
      const [detailRes, assignRes] = await Promise.all([
        getExchangeDetailsAction(exchangeId),
        getMyAssignmentAction(exchangeId),
      ]);

      if (detailRes.success && detailRes.data) {
        const { exchange: ex, participants: parts, exclusions: excls, invitationToken } = detailRes.data;
        const theme: ThemeKey = (['navidad', 'amistad', 'cumpleanos', 'general'].includes(ex.selectedTheme)
          ? ex.selectedTheme
          : 'general') as ThemeKey;
        const suggested: ThemeKey = (['navidad', 'amistad', 'cumpleanos', 'general'].includes(ex.suggestedTheme)
          ? ex.suggestedTheme
          : theme) as ThemeKey;

        const mappedParticipants = parts.map((p) => ({
          id: p.userId,
          alias: p.alias,
          avatarColor: p.avatarColor,
          isOrganizer: p.isOrganizer,
          isReady: (p.wishCount || 0) > 0,
          joinedAt: p.joinedAt,
          wishCount: p.wishCount || 0,
          status: p.status as 'approved' | 'pending' | 'rejected',
        }));

        const approvedCount = mappedParticipants.filter((p) => p.status === 'approved').length;

        const loadedExchange: Exchange = {
          id: ex.id,
          name: ex.name,
          description: ex.description,
          eventDate: ex.eventDate,
          registrationDeadline: ex.registrationDeadline,
          timezone: 'America/Costa_Rica',
          budgetAmount: ex.budgetAmount,
          currency: ex.currency as Currency,
          status: ex.status as ExchangeStatus,
          suggestedTheme: suggested,
          selectedTheme: theme,
          manualThemeOverride: (ex.manualThemeOverride as ThemeKey) || undefined,
          organizerName: ex.organizerAlias,
          isCurrentUserOrganizer: ex.isCurrentUserOrganizer,
          inviteCode: invitationToken || '',
          requiresApproval: ex.requiresApproval,
          minParticipants: ex.minParticipants || 3,
          currentDrawVersion: ex.currentDrawVersion || 0,
          currentUserMemberStatus: (ex.currentUserMemberStatus || 'approved') as 'approved' | 'pending' | 'rejected',
          participantCount: approvedCount,
          participants: mappedParticipants,
          exclusions: excls || [],
        };

        if (assignRes.success && assignRes.data) {
          loadedExchange.assignment = assignRes.data;
          setCurrentAssignment(assignRes.data);
        } else {
          setCurrentAssignment(null);
        }

        setCurrentExchange(loadedExchange);
      } else if (detailRes.error) {
        setErrorMessage(detailRes.error);
      }
    } catch {
      setErrorMessage('Error al cargar detalles del intercambio.');
    }
  }, []);

  // Initial load: consume any one-time pending consent intent via POST Server Action before clearing isLoading
  useEffect(() => {
    queueMicrotask(async () => {
      await reloadConsent();
      await Promise.all([reloadExchanges(), reloadWishes()]);
    });
  }, [reloadConsent, reloadExchanges, reloadWishes]);

  // When selected exchange changes
  useEffect(() => {
    queueMicrotask(() => {
      if (selectedExchangeId) {
        void loadExchangeDetails(selectedExchangeId);
      } else {
        setCurrentExchange(null);
        setCurrentAssignment(null);
      }
    });
  }, [selectedExchangeId, loadExchangeDetails]);

  const switchTab = (tab: NavigationTab) => {
    setErrorMessage(null);
    setActiveTab(tab);
    if (tab === 'intercambios') setActiveView('intercambios_lista');
    else if (tab === 'deseos') setActiveView('deseos_lista');
    else if (tab === 'cuenta') setActiveView('cuenta_perfil');
  };

  const navigateTo = (view: AppView, exchangeId?: string) => {
    setErrorMessage(null);
    setActiveView(view);
    if (exchangeId) {
      setSelectedExchangeId(exchangeId);
    }
  };

  const createExchange = async (data: {
    name: string;
    description?: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
    currency: 'CRC' | 'USD';
    suggestedTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general';
    selectedTheme: 'navidad' | 'amistad' | 'cumpleanos' | 'general';
    requiresApproval: boolean;
  }) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await createExchangeAction(data);
      if (res.success && res.data) {
        await reloadExchanges();
        setSelectedExchangeId(res.data.exchangeId);
        setActiveView('intercambio_detalle');
        return { success: true, exchangeId: res.data.exchangeId };
      }
      return { success: false, error: res.error || 'Error al crear intercambio' };
    } catch {
      return { success: false, error: 'Excepción de red al crear intercambio' };
    } finally {
      setIsLoading(false);
    }
  };

  const manageMember = async (targetUserId: string, newStatus: 'approved' | 'rejected') => {
    if (!selectedExchangeId) return false;
    setErrorMessage(null);
    const res = await manageMemberStatusAction(selectedExchangeId, targetUserId, newStatus);
    if (res.success) {
      await loadExchangeDetails(selectedExchangeId);
      await reloadExchanges();
      return true;
    }
    setErrorMessage(res.error || 'Error al gestionar participante');
    return false;
  };

  const updateExchangeThemeHandler = async (exchangeId: string, newTheme: ThemeKey) => {
    setErrorMessage(null);
    const res = await updateExchangeThemeAction(exchangeId, newTheme);
    if (res.success) {
      await loadExchangeDetails(exchangeId);
      await reloadExchanges();
      return true;
    }
    setErrorMessage(res.error || 'Error al cambiar el tema del intercambio.');
    return false;
  };

  const saveExclusionsHandler = async (
    exchangeId: string,
    rules: Array<{ giverUserId: string; excludedReceiverUserId: string }>
  ) => {
    setErrorMessage(null);
    const res = await setExchangeExclusionsAction(exchangeId, rules);
    if (res.success) {
      await loadExchangeDetails(exchangeId);
      return true;
    }
    setErrorMessage(res.error || 'Error al guardar las restricciones del sorteo.');
    return false;
  };

  const regenerateInviteLinkHandler = async (exchangeId: string) => {
    setErrorMessage(null);
    const res = await regenerateInvitationAction(exchangeId);
    if (res.success && res.data?.inviteToken) {
      await loadExchangeDetails(exchangeId);
      return res.data.inviteToken;
    }
    setErrorMessage(res.error || 'No se pudo renovar el enlace de invitación.');
    return null;
  };

  const executeDrawHandler = async (exchangeId: string, invalidationReason?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const expectedVersion =
        currentExchange && currentExchange.id === exchangeId
          ? (currentExchange.currentDrawVersion ?? 0)
          : 0;
      const res = await triggerDrawAction(exchangeId, expectedVersion, invalidationReason);
      if (res.success) {
        await loadExchangeDetails(exchangeId);
        await reloadExchanges();
        return { success: true };
      }
      return { success: false, error: res.error };
    } catch {
      return { success: false, error: 'Error al ejecutar sorteo.' };
    } finally {
      setIsLoading(false);
    }
  };

  const revealAssignmentHandler = async (exchangeId: string) => {
    setErrorMessage(null);
    const res = await revealAssignmentAction(exchangeId);
    if (res.success) {
      await loadExchangeDetails(exchangeId);
      return true;
    }
    setErrorMessage(res.error || 'No se pudo revelar la asignación.');
    return false;
  };

  const toggleWishPurchased = async (exchangeId: string, wishId: string) => {
    if (!currentAssignment) return false;
    setErrorMessage(null);
    const targetWish = currentAssignment.wishes.find((w) => w.id === wishId);
    const currentlyPurchased = targetWish?.isPurchasedByGiver || false;

    const res = await toggleWishPurchaseAction(exchangeId, wishId, !currentlyPurchased);
    if (res.success) {
      setCurrentAssignment((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          wishes: prev.wishes.map((w) =>
            w.id === wishId
              ? { ...w, isPurchasedByGiver: !currentlyPurchased, isPurchased: !currentlyPurchased }
              : w
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
                ? { ...w, isPurchasedByGiver: !currentlyPurchased, isPurchased: !currentlyPurchased }
                : w
            ),
          },
        };
      });
      return true;
    }
    setErrorMessage(res.error || 'No se pudo actualizar la marca de compra.');
    return false;
  };

  const saveWishHandler = async (wish: {
    id?: string;
    title: string;
    description?: string;
    url?: string;
    approximatePrice?: number;
    currency?: 'CRC' | 'USD';
    priority?: 'alta' | 'media' | 'baja';
  }) => {
    setErrorMessage(null);
    const res = await saveWishAction(wish);
    if (res.success) {
      await reloadWishes();
      return true;
    }
    setErrorMessage(res.error || 'Error al guardar deseo');
    return false;
  };

  const deleteWishHandler = async (wishId: string) => {
    setErrorMessage(null);
    const res = await deleteWishAction(wishId);
    if (res.success) {
      await reloadWishes();
      return true;
    }
    setErrorMessage(res.error || 'Error al eliminar deseo');
    return false;
  };

  const toggleWishInExchange = async (exchangeId: string, wishId: string, selected: boolean) => {
    setErrorMessage(null);
    const res = await toggleWishInExchangeAction(exchangeId, wishId, selected);
    if (res.success) {
      await reloadWishes();
      if (selectedExchangeId === exchangeId) {
        await loadExchangeDetails(exchangeId);
      }
      return true;
    }
    setErrorMessage(res.error || 'No se pudo actualizar la selección del deseo para el intercambio.');
    return false;
  };

  const updateUserAlias = async (newAlias: string) => {
    setErrorMessage(null);
    const res = await updateProfileAliasAction(newAlias);
    if (res.success) {
      setUser((prev) => ({ ...prev, alias: newAlias }));
      return true;
    }
    setErrorMessage(res.error || 'Error al actualizar alias');
    return false;
  };

  const confirmConsentHandler = async (termsAccepted: boolean, privacyAccepted: boolean) => {
    setErrorMessage(null);
    const res = await recordConsentAction({
      termsAccepted,
      privacyAccepted,
      version: LEGAL_CONSTANTS.VERSION,
    });
    clearClientPendingConsentCookie();
    if (res.success) {
      setHasConsented(true);
      setConsentVersion(LEGAL_CONSTANTS.VERSION);
      return true;
    }
    setErrorMessage(res.error || 'No se pudo registrar el consentimiento.');
    return false;
  };

  const revokeUserConsentHandler = async () => {
    setErrorMessage(null);
    clearClientPendingConsentCookie();
    const res = await revokeConsentAction();
    if (res.success) {
      setHasConsented(false);
      setConsentVersion(null);
      return true;
    }
    setErrorMessage(res.error || 'No se pudo revocar el consentimiento.');
    return false;
  };

  const submitPrivacyRequestHandler = async (type: 'export' | 'delete', notes?: string) => {
    setErrorMessage(null);
    const res = await submitPrivacyRequestAction(type, notes);
    if (!res.success) {
      setErrorMessage(res.error || 'Error al registrar la solicitud de privacidad.');
    }
    return res.success;
  };

  const exportAllUserDataHandler = async () => {
    setErrorMessage(null);
    const res = await exportUserDataAction();
    if (res.success && res.data) {
      return res.data as Record<string, unknown>;
    }
    throw new Error(res.error || 'Error al exportar datos');
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
        errorMessage,
        switchTab,
        navigateTo,
        createExchange,
        manageMember,
        updateExchangeTheme: updateExchangeThemeHandler,
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
    throw new Error('useRealData debe usarse dentro de un RealDataProvider');
  }
  return context;
}

export function useOptionalRealData() {
  return useContext(RealDataContext);
}
