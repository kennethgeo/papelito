'use client';

import React, { createContext, useContext, useState, useEffect, useSyncExternalStore } from 'react';
import {
  Exchange,
  UserProfile,
  Wish,
  ActiveTab,
  AppView,
  ThemeKey,
} from '@/types';
import {
  INITIAL_EXCHANGES,
  INITIAL_USER_PROFILE,
  INITIAL_USER_WISHES,
} from '@/lib/demo-data';
import { inferThemeFromDate } from '@/lib/theme';

interface DemoDataContextType {
  exchanges: Exchange[];
  currentExchange: Exchange | null;
  currentExchangeId: string | null;
  userProfile: UserProfile;
  userWishes: Wish[];
  activeTab: ActiveTab;
  activeView: AppView;
  isHydrated: boolean;
  // Actions
  navigateTo: (view: AppView, exchangeId?: string) => void;
  switchTab: (tab: ActiveTab) => void;
  setCurrentExchangeId: (id: string | null) => void;
  createExchange: (data: {
    name: string;
    description: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
    currency: 'CRC' | 'USD';
    requiresApproval: boolean;
    manualThemeOverride?: ThemeKey;
  }) => string;
  updateExchangeTheme: (id: string, theme: ThemeKey) => void;
  revealAssignment: (exchangeId: string) => void;
  toggleWishPurchased: (exchangeId: string, wishId: string) => void;
  addUserWish: (wish: Omit<Wish, 'id' | 'createdAt'>) => void;
  updateUserWish: (id: string, updates: Partial<Wish>) => void;
  deleteUserWish: (id: string) => void;
  updateProfileAlias: (alias: string) => void;
  resetDemoData: () => void;
}

const DemoDataContext = createContext<DemoDataContextType | undefined>(undefined);

const STORAGE_KEYS = {
  EXCHANGES: 'el_lazo_demo_exchanges_v1',
  PROFILE: 'el_lazo_demo_profile_v1',
  WISHES: 'el_lazo_demo_wishes_v1',
};

function getStoredOrDefault<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

const emptySubscribe = () => () => {};

export const DemoDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Officially recommended hydration check via useSyncExternalStore
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [exchanges, setExchanges] = useState<Exchange[]>(() =>
    getStoredOrDefault(STORAGE_KEYS.EXCHANGES, INITIAL_EXCHANGES)
  );
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    getStoredOrDefault(STORAGE_KEYS.PROFILE, INITIAL_USER_PROFILE)
  );
  const [userWishes, setUserWishes] = useState<Wish[]>(() =>
    getStoredOrDefault(STORAGE_KEYS.WISHES, INITIAL_USER_WISHES)
  );
  const [currentExchangeId, setCurrentExchangeId] = useState<string | null>('exc-navidad-2026');
  const [activeTab, setActiveTab] = useState<ActiveTab>('intercambios');
  const [activeView, setActiveView] = useState<AppView>('intercambios_lista');

  // Save to localStorage when state changes
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.EXCHANGES, JSON.stringify(exchanges));
    } catch {}
  }, [exchanges, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(userProfile));
    } catch {}
  }, [userProfile, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.WISHES, JSON.stringify(userWishes));
    } catch {}
  }, [userWishes, isHydrated]);

  const currentExchange = exchanges.find((e) => e.id === currentExchangeId) || null;

  const navigateTo = (view: AppView, exchangeId?: string) => {
    if (exchangeId) {
      setCurrentExchangeId(exchangeId);
    }
    setActiveView(view);

    // Sync tab
    if (
      view === 'intercambios_lista' ||
      view === 'intercambio_crear' ||
      view === 'intercambio_detalle' ||
      view === 'asignacion_revelar'
    ) {
      setActiveTab('intercambios');
    } else if (view === 'deseos_lista') {
      setActiveTab('deseos');
    } else if (view === 'cuenta_perfil') {
      setActiveTab('cuenta');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'intercambios') {
      setActiveView('intercambios_lista');
    } else if (tab === 'deseos') {
      setActiveView('deseos_lista');
    } else if (tab === 'cuenta') {
      setActiveView('cuenta_perfil');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const createExchange = (data: {
    name: string;
    description: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
    currency: 'CRC' | 'USD';
    requiresApproval: boolean;
    manualThemeOverride?: ThemeKey;
  }): string => {
    const newId = `exc-custom-${Date.now()}`;
    const suggested = inferThemeFromDate(data.eventDate).theme;
    const finalTheme = data.manualThemeOverride || suggested;

    const newExchange: Exchange = {
      id: newId,
      name: data.name,
      description: data.description,
      eventDate: data.eventDate,
      registrationDeadline: data.registrationDeadline,
      timezone: 'America/Costa_Rica',
      budgetAmount: data.budgetAmount,
      currency: data.currency,
      status: 'inscripcion_abierta',
      suggestedTheme: suggested,
      selectedTheme: finalTheme,
      manualThemeOverride: data.manualThemeOverride,
      organizerName: userProfile.alias,
      isCurrentUserOrganizer: true,
      inviteCode: `LAZO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      requiresApproval: data.requiresApproval,
      minParticipants: 3,
      participants: [
        {
          id: userProfile.id,
          alias: userProfile.alias,
          avatarColor: userProfile.avatarColor,
          isOrganizer: true,
          isReady: true,
          joinedAt: new Date().toISOString().split('T')[0],
          wishCount: userWishes.length,
        },
      ],
    };

    setExchanges((prev) => [newExchange, ...prev]);
    setCurrentExchangeId(newId);
    return newId;
  };

  const updateExchangeTheme = (id: string, theme: ThemeKey) => {
    setExchanges((prev) =>
      prev.map((exc) => {
        if (exc.id === id) {
          return {
            ...exc,
            selectedTheme: theme,
            manualThemeOverride: theme,
          };
        }
        return exc;
      })
    );
  };

  const revealAssignment = (exchangeId: string) => {
    setExchanges((prev) =>
      prev.map((exc) => {
        if (exc.id === exchangeId && exc.assignment) {
          return {
            ...exc,
            assignment: {
              ...exc.assignment,
              revealed: true,
              revealedAt: new Date().toISOString(),
            },
          };
        }
        return exc;
      })
    );
  };

  const toggleWishPurchased = (exchangeId: string, wishId: string) => {
    setExchanges((prev) =>
      prev.map((exc) => {
        if (exc.id === exchangeId && exc.assignment) {
          return {
            ...exc,
            assignment: {
              ...exc.assignment,
              wishes: exc.assignment.wishes.map((w) =>
                w.id === wishId ? { ...w, isPurchasedByGiver: !w.isPurchasedByGiver } : w
              ),
            },
          };
        }
        return exc;
      })
    );
  };

  const addUserWish = (wishData: Omit<Wish, 'id' | 'createdAt'>) => {
    const newWish: Wish = {
      ...wishData,
      id: `wish-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setUserWishes((prev) => [newWish, ...prev]);
  };

  const updateUserWish = (id: string, updates: Partial<Wish>) => {
    setUserWishes((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  };

  const deleteUserWish = (id: string) => {
    setUserWishes((prev) => prev.filter((w) => w.id !== id));
  };

  const updateProfileAlias = (alias: string) => {
    setUserProfile((prev) => ({ ...prev, alias }));
    setExchanges((prev) =>
      prev.map((exc) => ({
        ...exc,
        organizerName: exc.isCurrentUserOrganizer ? alias : exc.organizerName,
        participants: exc.participants.map((p) =>
          p.id === userProfile.id ? { ...p, alias } : p
        ),
      }))
    );
  };

  const resetDemoData = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.EXCHANGES);
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
      localStorage.removeItem(STORAGE_KEYS.WISHES);
    } catch {}
    setExchanges(INITIAL_EXCHANGES);
    setUserProfile(INITIAL_USER_PROFILE);
    setUserWishes(INITIAL_USER_WISHES);
    setCurrentExchangeId('exc-navidad-2026');
    setActiveTab('intercambios');
    setActiveView('intercambios_lista');
  };

  return (
    <DemoDataContext.Provider
      value={{
        exchanges,
        currentExchange,
        currentExchangeId,
        userProfile,
        userWishes,
        activeTab,
        activeView,
        isHydrated,
        navigateTo,
        switchTab,
        setCurrentExchangeId,
        createExchange,
        updateExchangeTheme,
        revealAssignment,
        toggleWishPurchased,
        addUserWish,
        updateUserWish,
        deleteUserWish,
        updateProfileAlias,
        resetDemoData,
      }}
    >
      {children}
    </DemoDataContext.Provider>
  );
};

export const useDemoData = () => {
  const context = useContext(DemoDataContext);
  if (!context) {
    throw new Error('useDemoData must be used within a DemoDataProvider');
  }
  return context;
};

export const useOptionalDemoData = () => {
  return useContext(DemoDataContext);
};
