'use server';
import { requireUser, safeAction } from './access';
import { getBudgetPoll, mutateBudgetPoll, getPersonalHistory, getRepresented, addRepresented, representedWish, removeRepresented, submitSupportReport, manageRepresentedWish, revealRepresented } from '@/lib/repositories/selected-features';
import { dbQuery } from '@/lib/db/client';
import { createPersonalLink, setRepresentedAccess } from '@/lib/repositories/personal-links';
export async function budgetPollAction(exchangeId: string) { return safeAction(async () => getBudgetPoll(exchangeId, (await requireUser()).id)); }
export async function changeBudgetPollAction(exchangeId: string, operation: 'create' | 'vote' | 'close', value: unknown) { return safeAction(async () => mutateBudgetPoll(exchangeId, (await requireUser()).id, operation, value)); }
export async function historyAction() { return safeAction(async () => getPersonalHistory((await requireUser()).id)); }
export async function representedAction(exchangeId: string) { return safeAction(async () => getRepresented(exchangeId, (await requireUser()).id)); }
export async function addRepresentedAction(exchangeId: string, alias: string, authorized: boolean, access: unknown) { return safeAction(async () => addRepresented(exchangeId, (await requireUser()).id, alias, authorized, access)); }
export async function setRepresentedAccessAction(exchangeId: string, id: string, access: unknown) { return safeAction(async () => setRepresentedAccess(exchangeId, (await requireUser()).id, id, access)); }
export async function createPersonalLinkAction(exchangeId: string, id: string) { return safeAction(async () => createPersonalLink(exchangeId, (await requireUser()).id, id)); }
export async function representedWishAction(exchangeId: string, id: string, title: string) { return safeAction(async () => representedWish(exchangeId, (await requireUser()).id, id, title)); }
export async function removeRepresentedAction(exchangeId: string, id: string) { return safeAction(async () => removeRepresented(exchangeId, (await requireUser()).id, id)); }
export async function deleteRepresentedWishAction(exchangeId: string, id: string, wishId: string) { return safeAction(async () => manageRepresentedWish(exchangeId, (await requireUser()).id, id, wishId)); }
export async function revealRepresentedAction(exchangeId: string, id: string) { return safeAction(async () => revealRepresented(exchangeId, (await requireUser()).id, id)); }
export async function supportReportAction(description: string, area: string) { return safeAction(async () => submitSupportReport((await requireUser()).id, description, area)); }
export async function serviceStatusAction() {
  const start = Date.now();
  const result = await safeAction(async () => { await requireUser(); await dbQuery('SELECT 1'); return { checkedAt: new Date().toISOString(), elapsedMs: Date.now() - start }; });
  return result;
}
