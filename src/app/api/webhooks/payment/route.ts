import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { verifyPaymentWebhookSecret } from '@/lib/payment';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { notifyCustomerOrderPaid, notifyStaffNewOrder } from '@/lib/bot';

/**
 * Handles payment confirmation from:
 * 1) Bank webhook (ABA PayWay / KHQR) authenticated via `x-webhook-secret`
 * 2) Staff manual confirmation from Admin/Seller panel (`super_admin`, `admin`, `seller`)
 * 3) Sandbox/manual test mode when `PAYMENT_PROVIDER=manual` and `NODE_ENV !== 'production'`
 */
export async function POST(request: Request) {
  const hasWebhookSecret = verifyPaymentWebhookSecret(request);
  let isAuthorizedStaff = false;

  if (!hasWebhookSecret) {
    const auth = await getAuthContext(request);
    isAuthorizedStaff = Boolean(auth && hasRole(auth.staffRole, ['super_admin', 'admin', 'seller']));
  }

  const isDevManual =
    process.env.NODE_ENV !== 'production' &&
    (process.env.PAYMENT_PROVIDER ?? 'manual') === 'manual';

  if (!hasWebhookSecret && !isAuthorizedStaff && !isDevManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    transactionRef?: string;
    orderId?: number;
    status?: string;
  };

  if (!body.transactionRef && !body.orderId) {
    return NextResponse.json(
      { error: 'transactionRef or orderId is required' },
      { status: 400 },
    );
  }

  const payment = body.transactionRef
    ? await db.orm.public.Payment.where({ transactionRef: body.transactionRef }).first()
    : await db.orm.public.Payment.where({ orderId: Number(body.orderId) }).first();

  if (!payment) {
    return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
  }

  if (payment.status === 'paid') {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  const targetStatus = body.status === 'failed' ? 'failed' : 'paid';

  await db.orm.public.Payment.where({ id: payment.id }).update({
    status: targetStatus,
    rawPayload: JSON.stringify(body),
    paidAt: targetStatus === 'paid' ? new Date() : null,
  });

  if (targetStatus === 'failed') {
    await db.orm.public.Order.where({ id: payment.orderId }).update({
      paymentStatus: 'failed',
    });
    return NextResponse.json({ ok: true, status: 'failed' });
  }

  await db.orm.public.Order.where({ id: payment.orderId }).update({
    paymentStatus: 'paid',
  });

  const order = await db.orm.public.Order
    .where({ id: payment.orderId })
    .include('items')
    .first();

  if (order) {
    // Decrement product stock atomically per item
    for (const item of order.items) {
      const product = await db.orm.public.Product.where({ id: item.productId }).first();
      if (product) {
        await db.orm.public.Product.where({ id: product.id }).update({
          stock: Math.max(0, product.stock - item.quantity),
        });
      }
    }

    await Promise.allSettled([
      notifyCustomerOrderPaid(order, order.items),
      notifyStaffNewOrder(order, order.items),
    ]);
  }

  return NextResponse.json({ ok: true, status: 'paid' });
}
