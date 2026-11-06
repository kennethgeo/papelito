'use server';
import { requireUser, safeAction } from './access';
import { renameExchange, renameRepresented } from '@/lib/repositories/names';
export async function renameExchangeAction(id: string, name: string, previous: string) {
  return safeAction(async () => renameExchange(id, (await requireUser()).id, name, previous));
}
export async function renameRepresentedAction(id: string, personId: string, alias: string, previous: string) {
  return safeAction(async () => renameRepresented(id, (await requireUser()).id, personId, alias, previous));
}
