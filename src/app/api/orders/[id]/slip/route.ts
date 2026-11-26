import { NextResponse } from 'next/server';
import { InlineKeyboard, InputFile } from 'grammy';
import { db } from '@/prisma/db';
import { getAuthContext } from '@/lib/telegram-auth';
import { getBot } from '@/lib/bot';
import { formatMoney } from '@/lib/payment';

export async function POST(
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

  const order = await db.orm.public.Order.where({ id: orderId }).first();
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.customerTelegramId !== auth.telegramUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (order.paymentStatus === 'paid' || order.orderStatus === 'cancelled') {
    return NextResponse.json(
      { error: 'Cannot upload slip for a paid or cancelled order.' },
      { status: 400 },
    );
  }

  const existingPayment = await db.orm.public.Payment.where({ orderId }).first();
  if (existingPayment?.rawPayload) {
    try {
      const parsed = JSON.parse(existingPayment.rawPayload) as { slipUploadedAt?: string };
      if (parsed.slipUploadedAt) {
        const elapsedMs = Date.now() - new Date(parsed.slipUploadedAt).getTime();
        if (elapsedMs < 30_000) {
          return NextResponse.json(
            { error: 'Please wait 30 seconds before uploading another slip.' },
            { status: 429 },
          );
        }
      }
    } catch {
      // Ignore malformed payload
    }
  }

  const body = (await request.json()) as { imageDataUrl?: string };
  if (!body.imageDataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Valid image is required' }, { status: 400 });
  }

  const base64 = body.imageDataUrl.split(',')[1];
  if (!base64) {
    return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
  }

  // Persist slip image on Payment.rawPayload so staff can also view it inside /admin
  await db.orm.public.Payment.where({ orderId }).update({
    rawPayload: JSON.stringify({
      slipImageUrl: body.imageDataUrl,
      slipUploadedAt: new Date().toISOString(),
    }),
  });

  const bot = getBot();
  if (bot) {
    const recipientIds = new Set<string>();
    const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.trim();
    if (superAdminId) {
      const settings = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first().catch(() => null);
      if (settings?.superAdminNotify !== false) {
        recipientIds.add(superAdminId);
      }
    }

    const activeStaff = await db.orm.public.StaffUser
      .where({ isActive: true, notifyOrders: true })
      .all();
    for (const staff of activeStaff) {
      recipientIds.add(staff.telegramId);
    }

    const buffer = Buffer.from(base64, 'base64');
    const caption = [
      `🧾 *Payment Slip Uploaded*`,
      `Order: \`${order.orderCode}\``,
      `Customer: ${order.customerName}`,
      `Amount: ${formatMoney(order.totalCents, order.currency)}`,
      `Phone: ${order.phone}`,
      `Address: ${order.address}`,
    ].join('\n');

    const keyboard = new InlineKeyboard()
      .text('✅ Confirm Paid', `confirm_paid:${order.id}`)
      .text('❌ Reject Slip', `reject_slip:${order.id}`);

    await Promise.allSettled(
      Array.from(recipientIds).map((chatId) =>
        bot.api.sendPhoto(chatId, new InputFile(buffer, `${order.orderCode}.jpg`), {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }),
      ),
    );
  }

  return NextResponse.json({ ok: true });
}
