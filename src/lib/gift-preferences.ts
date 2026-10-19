export interface GiftPreferences {
  interests: string;
  colors: string;
  sizes: string;
  avoid: string;
}
export const EMPTY_GIFT_PREFERENCES: GiftPreferences = { interests: '', colors: '', sizes: '', avoid: '' };
export const GIFT_FIELDS = [
  ['interests', 'Mis gustos y pasatiempos'],
  ['colors', 'Colores y estilos favoritos'],
  ['sizes', 'Tallas que quiero compartir'],
  ['avoid', 'Prefiero no recibir'],
] as const;
export function parseGiftPreferences(value: unknown): GiftPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Perfil de gustos inválido.');
  const input = value as Record<string, unknown>;
  const result = { ...EMPTY_GIFT_PREFERENCES };
  for (const [key] of GIFT_FIELDS) {
    if (typeof input[key] !== 'string' || input[key].length > 280) throw new Error('Cada respuesta debe tener hasta 280 caracteres.');
    result[key] = input[key].trim();
  }
  return result;
}
