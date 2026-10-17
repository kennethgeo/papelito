import { NextRequest, NextResponse } from 'next/server';
import { getNeonAuth } from '@/lib/auth/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: 'Neon Auth no está configurado en este entorno.' },
      { status: 503 }
    );
  }
  const handler = auth.handler();
  return handler.GET(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: 'Neon Auth no está configurado en este entorno.' },
      { status: 503 }
    );
  }
  const handler = auth.handler();
  return handler.POST(request, context);
}
