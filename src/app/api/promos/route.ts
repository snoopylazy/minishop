import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const promos = await db.orm.public.PromoCode.orderBy((p) => p.id.desc()).all();
  return NextResponse.json({ promos });
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as {
    code?: string;
    discountType?: string;
    discountValue?: number;
    minOrderCents?: number | null;
    maxUses?: number | null;
  };

  const code = body.code?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') ?? '';
  const discountType = body.discountType === 'fixed' ? 'fixed' : 'percent';
  const discountValue = Math.round(Number(body.discountValue ?? 0));

  if (code.length < 2 || discountValue <= 0) {
    return NextResponse.json({ error: 'Valid promo code and discount value are required' }, { status: 400 });
  }
  if (discountType === 'percent' && discountValue > 100) {
    return NextResponse.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 });
  }

  const existing = await db.orm.public.PromoCode.where({ code }).first();
  if (existing) {
    return NextResponse.json({ error: `Promo code ${code} already exists` }, { status: 400 });
  }

  const promo = await db.orm.public.PromoCode.create({
    code,
    discountType,
    discountValue,
    minOrderCents: body.minOrderCents && body.minOrderCents > 0 ? Math.round(body.minOrderCents) : null,
    maxUses: body.maxUses && body.maxUses > 0 ? Math.round(body.maxUses) : null,
    usedCount: 0,
    isActive: true,
  });

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'admin',
    action: 'promo.created',
    targetType: 'settings',
    targetId: code,
    details: `Created promo ${code} (${discountType === 'percent' ? `${discountValue}%` : `${discountValue} cents`})`,
  });

  return NextResponse.json({ promo }, { status: 201 });
}
