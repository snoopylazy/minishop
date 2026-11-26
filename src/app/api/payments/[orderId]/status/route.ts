import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await context.params;
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
  }

  const order = await db.orm.public.Order.where({ id }).first();
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const isStaff = hasRole(auth.staffRole, ['super_admin', 'admin', 'seller']);
  if (!isStaff && order.customerTelegramId !== auth.telegramUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderCode: order.orderCode,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
  });
}
