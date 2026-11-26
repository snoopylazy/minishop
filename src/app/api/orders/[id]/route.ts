import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { notifyCustomerOrderStatus } from '@/lib/bot';

const ALLOWED_STATUSES = ['new', 'preparing', 'shipped', 'delivered', 'cancelled'] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin', 'seller'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const body = (await request.json()) as { orderStatus?: string };
  if (
    !body.orderStatus ||
    !ALLOWED_STATUSES.includes(body.orderStatus as (typeof ALLOWED_STATUSES)[number])
  ) {
    return NextResponse.json({ error: 'Invalid orderStatus' }, { status: 400 });
  }

  const existing = await db.orm.public.Order.where({ id: orderId }).first();
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const updated = await db.orm.public.Order.where({ id: orderId }).update({
    orderStatus: body.orderStatus,
    handledByTelegramId: auth.telegramUser.id,
  });

  await notifyCustomerOrderStatus({
    orderCode: existing.orderCode,
    customerTelegramId: existing.customerTelegramId,
    orderStatus: body.orderStatus,
  });

  return NextResponse.json({ order: updated });
}
