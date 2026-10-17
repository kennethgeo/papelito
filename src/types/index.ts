export type ThemeKey = 'navidad' | 'amistad' | 'cumpleanos' | 'general';

export type ExchangeStatus =
  | 'borrador'
  | 'inscripcion_abierta'
  | 'inscripcion_cerrada'
  | 'sorteado'
  | 'finalizado'
  | 'cancelado';

export type Currency = 'CRC' | 'USD';

export interface Participant {
  id: string;
  alias: string;
  avatarColor: string;
  isOrganizer: boolean;
  isReady: boolean;
  joinedAt: string;
  wishCount: number;
  status?: 'approved' | 'pending' | 'rejected';
}

export interface Wish {
  id: string;
  exchangeId?: string; // Optional if wish is in user's global pool or specific exchange
  title: string;
  description?: string;
  url?: string;
  approximatePrice?: number;
  currency: Currency;
  priority: 'alta' | 'media' | 'baja';
  isPurchasedByGiver?: boolean; // Only visible to the secret giver!
  isPurchased?: boolean;
  selectedInExchanges?: string[];
  createdAt: string;
}

export interface Assignment {
  id?: string;
  exchangeId: string;
  giverId: string;
  receiverId: string;
  receiverName: string;
  receiverAlias: string;
  receiverAvatarColor: string;
  budgetAmount: number;
  currency: Currency;
  revealed: boolean;
  revealedAt?: string;
  wishes: Wish[];
}

export interface Exchange {
  id: string;
  name: string;
  description: string;
  eventDate: string; // YYYY-MM-DD (fecha del intercambio)
  registrationDeadline: string; // YYYY-MM-DD
  timezone: string; // 'America/Costa_Rica'
  budgetAmount: number;
  currency: Currency;
  status: ExchangeStatus;
  suggestedTheme: ThemeKey;
  selectedTheme: ThemeKey;
  manualThemeOverride?: ThemeKey;
  organizerName: string;
  isCurrentUserOrganizer: boolean;
  inviteCode: string;
  requiresApproval: boolean;
  participants: Participant[];
  participantCount?: number;
  exclusions?: Array<{ id?: string; giverId: string; receiverId: string }>;
  minParticipants: number;
  currentDrawVersion?: number;
  currentUserMemberStatus?: 'approved' | 'pending' | 'rejected';
  assignment?: Assignment;
}

export interface UserProfile {
  id: string;
  alias: string;
  fullName: string;
  email: string;
  avatarColor: string;
  isDemoAccount: boolean;
  preferences: {
    defaultCurrency: Currency;
    themePreference?: ThemeKey;
  };
  consents: {
    termsAccepted: boolean;
    dataConsent: boolean;
    acceptedAt: string;
  };
}

export type ActiveTab = 'intercambios' | 'deseos' | 'cuenta';
export type AppView =
  | 'bienvenida'
  | 'intercambios_lista'
  | 'intercambio_crear'
  | 'intercambio_detalle'
  | 'asignacion_revelar'
  | 'deseos_lista'
  | 'cuenta_perfil';
