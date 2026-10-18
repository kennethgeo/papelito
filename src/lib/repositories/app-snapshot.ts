import "server-only";
import { getMyExchanges, getExchangeDetails } from "./exchanges";
import { getMyWishes } from "./wishes";
import { getMyAssignment } from "./assignments";

export async function readAppSnapshot(
  userId: string,
  consent: { hasCurrentConsent: boolean; latestVersion: string | null },
  exchangeId?: string,
) {
  if (!consent.hasCurrentConsent)
    return {
      consent,
      exchanges: [],
      wishes: [],
      selected: null,
      detailError: null,
    };
  const selectedWork = exchangeId
    ? (async () => {
        try {
          const [details, assignment] = await Promise.all([
            getExchangeDetails(exchangeId, userId),
            getMyAssignment(exchangeId, userId),
          ]);
          return { selected: { details, assignment }, detailError: null };
        } catch {
          return {
            selected: null,
            detailError:
              "No pudimos abrir ese intercambio. Puede que ya no esté disponible para tu cuenta. Volvé a la lista o intentá actualizar.",
          };
        }
      })()
    : Promise.resolve({ selected: null, detailError: null });
  const [exchanges, wishes, detail] = await Promise.all([
    getMyExchanges(userId),
    getMyWishes(userId),
    selectedWork,
  ]);
  return { consent, exchanges, wishes, ...detail };
}

export type AppSnapshot = Awaited<ReturnType<typeof readAppSnapshot>>;
