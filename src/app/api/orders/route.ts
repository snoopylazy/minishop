import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { createOrderPaymentQR } from '@/lib/payment';
import { resolveVariantPriceCents } from '@/lib/variants';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  const isStaff = hasRole(auth.staffRole, ['super_admin', 'admin', 'seller']);
  const mineOnly = searchParams.get('mine') === '1';

  const all = isStaff && !mineOnly
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

  const orders = all.slice(offset, offset + limit);

  return NextResponse.json({ orders, page, limit, total: all.length, hasMore: offset + limit < all.length });
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    items?: Array<{ productId: number; quantity: number; variant?: string | null }>;
    phone?: string;
    address?: string;
    note?: string;
    customerName?: string;
    promoCode?: string;
  };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }
  if (!body.phone?.trim() || !body.address?.trim()) {
    return NextResponse.json({ error: 'Phone and delivery address are required' }, { status: 400 });
  }

  // Prevent order spam: max 3 active unpaid orders per customer
  const pendingOrders = await db.orm.public.Order
    .where({ customerTelegramId: auth.telegramUser.id, paymentStatus: 'pending' })
    .all();
  const activeUnpaid = pendingOrders.filter((o) => o.orderStatus !== 'cancelled');
  if (activeUnpaid.length >= 3) {
    return NextResponse.json(
      { error: 'You have 3 unpaid orders. Please pay or remove an unpaid order first.' },
      { status: 400 },
    );
  }

  const productIds = body.items.map((item) => Number(item.productId));
  const products = await db.orm.public.Product
    .where((p) => p.id.in(productIds))
    .where({ isActive: true })
    .all();

  const productMap = new Map(products.map((p) => [p.id, p]));

  const totalQtyByProduct = new Map<number, number>();
  for (const item of body.items) {
    const qty = Math.round(Number(item.quantity));
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Invalid item quantity' }, { status: 400 });
    }
    const pid = Number(item.productId);
    totalQtyByProduct.set(pid, (totalQtyByProduct.get(pid) ?? 0) + qty);
  }

  for (const [pid, totalQty] of totalQtyByProduct.entries()) {
    const product = productMap.get(pid);
    if (!product) {
      return NextResponse.json({ error: `Product ${pid} not found` }, { status: 404 });
    }
    if (product.stock < totalQty) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name} (${product.stock} left)` },
        { status: 400 },
      );
    }
  }

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
    const product = productMap.get(Number(item.productId))!;
    currency = product.currency;
    const variantLabel = item.variant?.trim();
    const unitPriceCents = resolveVariantPriceCents(product.variants, product.priceCents, variantLabel);
    totalCents += unitPriceCents * qty;
    resolvedItems.push({
      productId: product.id,
      productName: variantLabel ? `${product.name} (${variantLabel})` : product.name,
      quantity: qty,
      unitPriceCents,
    });
  }

  let appliedPromoCode: string | null = null;
  let discountCents = 0;
  if (body.promoCode?.trim()) {
    const code = body.promoCode.trim().toUpperCase();
    const promo = await db.orm.public.PromoCode.where({ code }).first();
    if (
      promo &&
      promo.isActive &&
      (!promo.maxUses || promo.usedCount < promo.maxUses) &&
      (!promo.minOrderCents || totalCents >= promo.minOrderCents)
    ) {
      discountCents =
        promo.discountType === 'percent'
          ? Math.round((totalCents * promo.discountValue) / 100)
          : Math.min(totalCents, promo.discountValue);
      appliedPromoCode = promo.code;
      await db.orm.public.PromoCode.where({ id: promo.id }).update({
        usedCount: promo.usedCount + 1,
      });
    }
  }

  const discountedSubtotal = Math.max(0, totalCents - discountCents);

  const shopSettings = await db.orm.public.ShopSettings
    .orderBy((s) => s.id.asc())
    .first()
    .catch(() => null);

  let deliveryFeeCents = shopSettings?.deliveryFeeCents ?? 0;
  if (
    deliveryFeeCents > 0 &&
    shopSettings?.freeDeliveryThresholdCents &&
    discountedSubtotal >= shopSettings.freeDeliveryThresholdCents
  ) {
    deliveryFeeCents = 0;
  }
  const grandTotalCents = discountedSubtotal + deliveryFeeCents;

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
    promoCode: appliedPromoCode,
    discountCents,
    totalCents: grandTotalCents,
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
    amountCents: grandTotalCents,
    currency,
  });

  await db.orm.public.Payment.create({
    orderId: order.id,
    provider: paymentInit.provider,
    transactionRef: paymentInit.transactionRef,
    qrString: paymentInit.qrString,
    amountCents: grandTotalCents,
    status: 'pending',
  });

  return NextResponse.json(
    {
      order,
      payment: {
        transactionRef: paymentInit.transactionRef,
        provider: paymentInit.provider,
        qrDataUrl: paymentInit.qrDataUrl,
        customQrImageUrl: shopSettings?.paymentQrImageUrl ?? null,
        paymentNote: shopSettings?.paymentNote ?? null,
        amountCents: grandTotalCents,
        deliveryFeeCents,
        currency,
      },
    },
    { status: 201 },
  );
}
