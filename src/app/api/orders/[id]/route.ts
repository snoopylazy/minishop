import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { notifyCustomerOrderStatus } from '@/lib/bot';
import { recordAuditLog } from '@/lib/audit';

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

  const existing = await db.orm.public.Order
    .where({ id: orderId })
    .include('items')
    .first();
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const updated = await db.orm.public.Order.where({ id: orderId }).update({
    orderStatus: body.orderStatus,
    handledByTelegramId: auth.telegramUser.id,
  });

  // Restore product stock when a paid order is cancelled for the first time
  if (
    body.orderStatus === 'cancelled' &&
    existing.orderStatus !== 'cancelled' &&
    existing.paymentStatus === 'paid'
  ) {
    for (const item of existing.items) {
      const product = await db.orm.public.Product.where({ id: item.productId }).first();
      if (product) {
        await db.orm.public.Product.where({ id: product.id }).update({
          stock: product.stock + item.quantity,
        });
      }
    }
  }

  await notifyCustomerOrderStatus({
    orderCode: existing.orderCode,
    customerTelegramId: existing.customerTelegramId,
    orderStatus: body.orderStatus,
  });

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'staff',
    action: 'order.status_updated',
    targetType: 'order',
    targetId: existing.orderCode,
    details: `${existing.orderCode}: ${existing.orderStatus} -> ${body.orderStatus}`,
  });

  return NextResponse.json({ order: updated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const existing = await db.orm.public.Order.where({ id: orderId }).first();
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const isAdmin = hasRole(auth.staffRole, ['super_admin', 'admin']);
  const isOwner = existing.customerTelegramId === auth.telegramUser.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isAdmin && existing.paymentStatus === 'paid') {
    return NextResponse.json(
      { error: 'Paid orders cannot be removed by customer.' },
      { status: 400 },
    );
  }

  if (existing.orderStatus !== 'cancelled' && existing.paymentStatus === 'paid') {
    return NextResponse.json(
      { error: 'Cancel a paid order first before deleting it.' },
      { status: 400 },
    );
  }

  await db.orm.public.OrderItem.where({ orderId }).delete();
  await db.orm.public.Payment.where({ orderId }).delete();
  await db.orm.public.Order.where({ id: orderId }).delete();

  if (isAdmin) {
    await recordAuditLog({
      actorTelegramId: auth.telegramUser.id,
      actorName: auth.telegramUser.fullName,
      actorRole: auth.staffRole ?? 'admin',
      action: 'order.deleted',
      targetType: 'order',
      targetId: existing.orderCode,
      details: `Deleted order ${existing.orderCode} (${existing.paymentStatus})`,
    });
  }

  return NextResponse.json({ ok: true });
}
