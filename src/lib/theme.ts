import type { ThemeKey } from "@/types";
import { isCalendarDate } from "./event-dates";

export interface ThemeMeta {
  key: ThemeKey;
  label: string;
  tagline: string;
  accentColor: string;
  bgSubtle: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

export const THEME_CONFIG: Record<ThemeKey, ThemeMeta> = {
  navidad: {
    key: "navidad",
    label: "Navidad y Fin de Año",
    tagline: "Un secreto para compartir en Navidad",
    accentColor: "#285444",
    bgSubtle: "#F0F5EA",
    badgeBg: "#D8E5C5",
    badgeText: "#285444",
    description:
      "Papel amarillo, ramas verdes y un sobre con una sorpresa navideña.",
  },
  amistad: {
    key: "amistad",
    label: "Amistad y Compañerismo",
    tagline: "Un buen detalle entre amigos",
    accentColor: "#7043A2",
    bgSubtle: "#F5F0F9",
    badgeBg: "#EDE5F5",
    badgeText: "#46245D",
    description:
      "Lila y ciruela para las celebraciones entre amigos y compañeros.",
  },
  cumpleanos: {
    key: "cumpleanos",
    label: "Cumpleaños",
    tagline: "Una vuelta más, una sorpresa más",
    accentColor: "#806019",
    bgSubtle: "#FFFDF5",
    badgeBg: "#FEF3D6",
    badgeText: "#7A5200",
    description:
      "Papel amarillo y detalles de fiesta para celebrar un año más.",
  },
  general: {
    key: "general",
    label: "General / Cualquier ocasión",
    tagline: "Siempre hay algo que celebrar",
    accentColor: "#46245D",
    bgSubtle: "#F8F5FB",
    badgeBg: "#EDE5F5",
    badgeText: "#46245D",
    description: "Sobres, papelitos y la ilusión de preparar un buen regalo.",
  },
};

/**
 * Infers an initial suggested theme based strictly on the event's calendar date,
 * NEVER relying on the client's current date (new Date()).
 */
export function inferThemeFromDate(dateString: string): {
  theme: ThemeKey;
  reason: string;
} {
  if (!isCalendarDate(dateString)) {
    return {
      theme: "general",
      reason: "Sin fecha seleccionada: se aplica la identidad general base.",
    };
  }

  // Expecting YYYY-MM-DD or similar date format
  const parts = dateString.split("-");
  if (parts.length < 2) {
    return {
      theme: "general",
      reason: "Fecha no estándar: tema general sugerido.",
    };
  }

  const month = parseInt(parts[1], 10);
  const day = parts[2] ? parseInt(parts[2], 10) : 1;

  if (month === 12 || (month === 11 && day >= 20)) {
    return {
      theme: "navidad",
      reason:
        "Fecha en época navideña / fin de año: sugerimos el tema Navidad.",
    };
  }

  if (month === 2) {
    return {
      theme: "amistad",
      reason:
        "Fecha en febrero (mes de la amistad): sugerimos el tema Amistad.",
    };
  }

  return {
    theme: "general",
    reason:
      "Fecha en calendario regular: sugerimos el tema General (o elige Cumpleaños si aplica).",
  };
}

/**
 * Resolves the effective theme for an exchange:
 * Explicit manual override has priority, otherwise the date-inferred theme is used.
 */
export function resolveExchangeTheme(
  eventDate: string,
  manualOverride?: ThemeKey,
): ThemeKey {
  if (manualOverride) {
    return manualOverride;
  }
  return inferThemeFromDate(eventDate).theme;
}
