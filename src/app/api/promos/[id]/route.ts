import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await context.params;
  const promoId = Number(id);
  const body = (await request.json()) as { isActive?: boolean };
  const promo = await db.orm.public.PromoCode
    .where({ id: promoId })
    .update({ isActive: Boolean(body.isActive) });
  return NextResponse.json({ promo });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await context.params;
  await db.orm.public.PromoCode.where({ id: Number(id) }).delete();
  return NextResponse.json({ ok: true });
}
