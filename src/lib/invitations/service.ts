import 'server-only';
import { getInvitationPreview, acceptInvitationAtomic } from '@/lib/repositories/exchanges';
import { getServerSession } from '@/lib/auth/server';

export async function getInvitationPreviewService(token: string) {
  return await getInvitationPreview(token);
}

export async function acceptInvitationService(token: string) {
  const session = await getServerSession();
  if (!session || !session.user) {
    return { success: false, error: 'Debes iniciar sesión para unirte.' };
  }
  try {
    const res = await acceptInvitationAtomic(token, session.user.id);
    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al aceptar invitación.';
    return { success: false, error: message };
  }
}
