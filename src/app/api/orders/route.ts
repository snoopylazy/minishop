import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { createOrderPaymentQR } from '@/lib/payment';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isStaff = hasRole(auth.staffRole, ['super_admin', 'admin', 'seller']);

  const orders = isStaff
    ? await db.orm.public.Order
        .include('items')
        .include('payments')
        .orderBy((o) => o.createdAt.desc())
        .all()
    : await db.orm.public.Order
        .where({ customerTelegramId: auth.telegramUser.id })
        .include('items')
        .include('payments')
        .orderBy((o) => o.createdAt.desc())
        .all();

  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    items?: Array<{ productId: number; quantity: number }>;
    phone?: string;
    address?: string;
    note?: string;
    customerName?: string;
  };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }
  if (!body.phone?.trim() || !body.address?.trim()) {
    return NextResponse.json({ error: 'Phone and delivery address are required' }, { status: 400 });
  }

  const productIds = body.items.map((item) => Number(item.productId));
  const products = await db.orm.public.Product
    .where((p) => p.id.in(productIds))
    .where({ isActive: true })
    .all();

  const productMap = new Map(products.map((p) => [p.id, p]));

  let totalCents = 0;
  let currency = 'USD';
  const resolvedItems: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPriceCents: number;
  }> = [];

  for (const item of body.items) {
    const qty = Math.round(Number(item.quantity));
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Invalid item quantity' }, { status: 400 });
    }
    const product = productMap.get(Number(item.productId));
    if (!product) {
      return NextResponse.json({ error: `Product ${item.productId} not found` }, { status: 404 });
    }
    if (product.stock < qty) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 400 },
      );
    }
    currency = product.currency;
    totalCents += product.priceCents * qty;
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      unitPriceCents: product.priceCents,
    });
  }

  const orderCode = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;

  const order = await db.orm.public.Order.create({
    orderCode,
    customerTelegramId: auth.telegramUser.id,
    customerUsername: auth.telegramUser.username ?? null,
    customerName: body.customerName?.trim() || auth.telegramUser.fullName,
    phone: body.phone.trim(),
    address: body.address.trim(),
    note: body.note?.trim() || null,
    totalCents,
    currency,
    paymentStatus: 'pending',
    orderStatus: 'new',
  });

  await Promise.all(
    resolvedItems.map((item) =>
      db.orm.public.OrderItem.create({
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      }),
    ),
  );

  const paymentInit = await createOrderPaymentQR({
    orderCode,
    amountCents: totalCents,
    currency,
  });

  await db.orm.public.Payment.create({
    orderId: order.id,
    provider: paymentInit.provider,
    transactionRef: paymentInit.transactionRef,
    qrString: paymentInit.qrString,
    amountCents: totalCents,
    status: 'pending',
  });

  return NextResponse.json(
    {
      order,
      payment: {
        transactionRef: paymentInit.transactionRef,
        provider: paymentInit.provider,
        qrDataUrl: paymentInit.qrDataUrl,
        amountCents: totalCents,
        currency,
      },
    },
    { status: 201 },
  );
}
