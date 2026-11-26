import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const settings = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first();
    return NextResponse.json({
      paymentQrImageUrl: settings?.paymentQrImageUrl ?? null,
      paymentNote: settings?.paymentNote ?? null,
      deliveryFeeCents: settings?.deliveryFeeCents ?? 0,
      freeDeliveryThresholdCents: settings?.freeDeliveryThresholdCents ?? null,
    });
  } catch (err) {
    console.error('GET /api/settings error:', err);
    return NextResponse.json({
      paymentQrImageUrl: null,
      paymentNote: null,
      deliveryFeeCents: 0,
      freeDeliveryThresholdCents: null,
    });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      paymentQrImageUrl?: string | null;
      paymentNote?: string | null;
      deliveryFeeCents?: number;
      freeDeliveryThresholdCents?: number | null;
    };

    const paymentQrImageUrl = body.paymentQrImageUrl?.trim() || null;
    const paymentNote = body.paymentNote?.trim() || null;
    const deliveryFeeCents =
      typeof body.deliveryFeeCents === 'number' && body.deliveryFeeCents >= 0
        ? Math.round(body.deliveryFeeCents)
        : 0;
    const freeDeliveryThresholdCents =
      typeof body.freeDeliveryThresholdCents === 'number' && body.freeDeliveryThresholdCents > 0
        ? Math.round(body.freeDeliveryThresholdCents)
        : null;

    const existing = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first();
    const saved = existing
      ? await db.orm.public.ShopSettings.where({ id: existing.id }).update({
          paymentQrImageUrl,
          paymentNote,
          deliveryFeeCents,
          freeDeliveryThresholdCents,
        })
      : await db.orm.public.ShopSettings.create({
          paymentQrImageUrl,
          paymentNote,
          deliveryFeeCents,
          freeDeliveryThresholdCents,
        });

    await recordAuditLog({
      actorTelegramId: auth.telegramUser.id,
      actorName: auth.telegramUser.fullName,
      actorRole: auth.staffRole ?? 'admin',
      action: 'settings.updated',
      targetType: 'settings',
      targetId: 'shop_settings',
      details: `Updated shop settings (delivery fee: ${deliveryFeeCents} cents${paymentQrImageUrl ? ', QR set' : ''})`,
    });

    return NextResponse.json({
      paymentQrImageUrl: saved?.paymentQrImageUrl ?? null,
      paymentNote: saved?.paymentNote ?? null,
      deliveryFeeCents: saved?.deliveryFeeCents ?? 0,
      freeDeliveryThresholdCents: saved?.freeDeliveryThresholdCents ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('PUT /api/settings error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
