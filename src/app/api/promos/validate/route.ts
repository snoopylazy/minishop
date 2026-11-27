import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string; subtotalCents?: number };
  const code = body.code?.trim().toUpperCase() ?? '';
  const subtotalCents = Math.max(0, Math.round(Number(body.subtotalCents ?? 0)));

  if (!code) {
    return NextResponse.json({ error: 'Enter a promo code' }, { status: 400 });
  }

  const promo = await db.orm.public.PromoCode.where({ code }).first();
  if (!promo || !promo.isActive) {
    return NextResponse.json({ error: 'Invalid or expired promo code' }, { status: 404 });
  }
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    return NextResponse.json({ error: 'Promo code usage limit reached' }, { status: 400 });
  }
  if (promo.minOrderCents && subtotalCents < promo.minOrderCents) {
    return NextResponse.json({ error: 'Order subtotal does not meet minimum for this code' }, { status: 400 });
  }

  const discountCents =
    promo.discountType === 'percent'
      ? Math.round((subtotalCents * promo.discountValue) / 100)
      : Math.min(subtotalCents, promo.discountValue);

  return NextResponse.json({
    valid: true,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    discountCents,
  });
}
