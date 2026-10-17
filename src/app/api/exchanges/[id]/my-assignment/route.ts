import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server';
import { isDatabaseConfigured } from '@/lib/db/client';
import { getMyAssignment } from '@/lib/repositories/assignments';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Servicio de persistencia no configurado.' },
      { status: 503 }
    );
  }

  const session = await getServerSession();
  if (!session || !session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { id: exchangeId } = await props.params;

  try {
    const assignment = await getMyAssignment(exchangeId, session.user.id);
    if (!assignment) {
      return NextResponse.json(
        { error: 'No tienes una asignación activa en este intercambio.' },
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        receiverAlias: assignment.receiverAlias,
        receiverAvatarColor: assignment.receiverAvatarColor,
        budgetAmount: assignment.budgetAmount,
        currency: assignment.currency,
        revealedAt: assignment.revealedAt,
        wishes: assignment.wishes,
      },
    });

    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar asignación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
