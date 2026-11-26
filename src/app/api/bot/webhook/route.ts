import { NextResponse } from 'next/server';
import { InlineKeyboard } from 'grammy';
import { db } from '@/prisma/db';
import { getBot, notifyCustomerOrderStatus } from '@/lib/bot';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

async function isAuthorizedStaffTelegramId(telegramId: string): Promise<boolean> {
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.trim();
  if (superAdminId && telegramId === superAdminId) {
    return true;
  }
  const staff = await db.orm.public.StaffUser
    .where({ telegramId, isActive: true })
    .first();
  return Boolean(staff);
}

export async function POST(request: Request) {
  const bot = getBot();
  if (!bot) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
  }

  const update = (await request.json()) as TelegramUpdate;

  if (update.message?.text?.startsWith('/start')) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const chatId = update.message.chat.id;
    const firstName = update.message.from?.first_name ?? 'there';

    const keyboard = appUrl
      ? new InlineKeyboard().webApp('🛍️ Open Store', appUrl)
      : undefined;

    await bot.api.sendMessage(
      chatId,
      `Welcome ${firstName}! Tap below to browse products and order directly inside Telegram.`,
      keyboard ? { reply_markup: keyboard } : undefined,
    );
    return NextResponse.json({ ok: true });
  }

  if (update.callback_query?.data?.startsWith('order_status:')) {
    const cq = update.callback_query;
    const callbackData = cq.data ?? '';
    const senderId = String(cq.from.id);
    const allowed = await isAuthorizedStaffTelegramId(senderId);

    if (!allowed) {
      await bot.api.answerCallbackQuery(cq.id, {
        text: 'Only active staff can update orders.',
        show_alert: true,
      });
      return NextResponse.json({ ok: true });
    }

    const [, orderIdRaw, nextStatus] = callbackData.split(':');
    const orderId = Number(orderIdRaw);

    if (
      Number.isInteger(orderId) &&
      orderId > 0 &&
      ['preparing', 'shipped', 'delivered', 'cancelled'].includes(nextStatus)
    ) {
      const existing = await db.orm.public.Order.where({ id: orderId }).first();
      if (existing) {
        await db.orm.public.Order.where({ id: orderId }).update({
          orderStatus: nextStatus,
          handledByTelegramId: senderId,
        });

        await notifyCustomerOrderStatus({
          orderCode: existing.orderCode,
          customerTelegramId: existing.customerTelegramId,
          orderStatus: nextStatus,
        });

        await bot.api.answerCallbackQuery(cq.id, {
          text: `Order ${existing.orderCode} -> ${nextStatus}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
