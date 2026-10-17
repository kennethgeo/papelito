import 'server-only';
import { executeAndCommitDraw } from '@/lib/repositories/draw';
import { getServerSession } from '@/lib/auth/server';

export interface ExecuteDrawInput {
  exchangeId: string;
  expectedVersion: number;
  invalidationReason?: string;
}

export async function executeDraw(input: ExecuteDrawInput): Promise<{
  success: boolean;
  versionNumber?: number;
  error?: string;
}> {
  const session = await getServerSession();
  if (!session || !session.user) {
    return { success: false, error: 'No autenticado.' };
  }

  try {
    const res = await executeAndCommitDraw(
      input.exchangeId,
      session.user.id,
      input.expectedVersion,
      input.invalidationReason
    );
    return { success: true, versionNumber: res.version };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al realizar el sorteo.';
    return { success: false, error: message };
  }
}
