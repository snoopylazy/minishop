import { NextResponse } from 'next/server';
import { InlineKeyboard } from 'grammy';
import { db } from '@/prisma/db';
import {
  getBot,
  notifyCustomerOrderPaid,
  notifyCustomerOrderStatus,
  notifyStaffNewOrder,
} from '@/lib/bot';
import { recordAuditLog } from '@/lib/audit';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; last_name?: string };
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

async function getStaffActorInfo(telegramId: string, fallbackName?: string) {
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.trim();
  if (superAdminId && telegramId === superAdminId) {
    return { name: fallbackName || 'Super Admin', role: 'super_admin' };
  }
  const staff = await db.orm.public.StaffUser
    .where({ telegramId, isActive: true })
    .first();
  if (!staff) return null;
  return { name: staff.name || fallbackName || telegramId, role: staff.role };
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    const chatId = update.message.chat.id;
    const senderId = String(update.message.from?.id ?? chatId);
    const firstName = update.message.from?.first_name ?? 'there';
    const isStaff = await isAuthorizedStaffTelegramId(senderId);

    let keyboard: InlineKeyboard | undefined;
    if (appUrl) {
      keyboard = new InlineKeyboard().webApp('🛍️ Open Store', appUrl);
      if (isStaff) {
        keyboard.row().webApp('🛠️ Admin / Add Products', `${appUrl}/admin`);
      }
    }

    await bot.api.sendMessage(
      chatId,
      `Welcome ${firstName}! Tap below to browse products and order directly inside Telegram.\n\nYour Telegram ID: \`${senderId}\``,
      {
        parse_mode: 'Markdown',
        ...(keyboard ? { reply_markup: keyboard } : {}),
      },
    );
    return NextResponse.json({ ok: true });
  }

  if (update.callback_query?.data?.startsWith('confirm_paid:')) {
    const cq = update.callback_query;
    const senderId = String(cq.from.id);
    const allowed = await isAuthorizedStaffTelegramId(senderId);

    if (!allowed) {
      await bot.api.answerCallbackQuery(cq.id, {
        text: 'Only active staff can confirm payments.',
        show_alert: true,
      });
      return NextResponse.json({ ok: true });
    }

    const orderId = Number((cq.data ?? '').split(':')[1]);
    if (Number.isInteger(orderId) && orderId > 0) {
      const order = await db.orm.public.Order
        .where({ id: orderId })
        .include('items')
        .first();
      if (order && order.paymentStatus !== 'paid') {
        await db.orm.public.Order.where({ id: orderId }).update({
          paymentStatus: 'paid',
          handledByTelegramId: senderId,
        });
        await db.orm.public.Payment.where({ orderId }).update({
          status: 'paid',
          paidAt: new Date(),
        });
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
        const actor = await getStaffActorInfo(senderId, cq.from.first_name);
        await recordAuditLog({
          actorTelegramId: senderId,
          actorName: actor?.name ?? senderId,
          actorRole: actor?.role ?? 'staff',
          action: 'order.payment_confirmed_bot',
          targetType: 'order',
          targetId: order.orderCode,
          details: `Confirmed payment for ${order.orderCode} via Telegram Bot`,
        });
      }
      await bot.api.answerCallbackQuery(cq.id, { text: 'Payment confirmed!' });
    }
    return NextResponse.json({ ok: true });
  }

  if (update.callback_query?.data?.startsWith('reject_slip:')) {
    const cq = update.callback_query;
    const senderId = String(cq.from.id);
    const allowed = await isAuthorizedStaffTelegramId(senderId);

    if (!allowed) {
      await bot.api.answerCallbackQuery(cq.id, {
        text: 'Only active staff can reject slips.',
        show_alert: true,
      });
      return NextResponse.json({ ok: true });
    }

    const orderId = Number((cq.data ?? '').split(':')[1]);
    if (Number.isInteger(orderId) && orderId > 0) {
      const order = await db.orm.public.Order.where({ id: orderId }).first();
      if (order) {
        await bot.api
          .sendMessage(
            order.customerTelegramId,
            `❌ Your payment slip for order \`${order.orderCode}\` could not be verified. Please check the amount and upload a valid payment slip.`,
            { parse_mode: 'Markdown' },
          )
          .catch(() => {});
        const actor = await getStaffActorInfo(senderId, cq.from.first_name);
        await recordAuditLog({
          actorTelegramId: senderId,
          actorName: actor?.name ?? senderId,
          actorRole: actor?.role ?? 'staff',
          action: 'order.slip_rejected_bot',
          targetType: 'order',
          targetId: order.orderCode,
          details: `Rejected payment slip for ${order.orderCode} via Telegram Bot`,
        });
      }
      await bot.api.answerCallbackQuery(cq.id, { text: 'Slip rejected & customer notified.' });
    }
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

        const actor = await getStaffActorInfo(senderId, cq.from.first_name);
        await recordAuditLog({
          actorTelegramId: senderId,
          actorName: actor?.name ?? senderId,
          actorRole: actor?.role ?? 'staff',
          action: 'order.status_updated_bot',
          targetType: 'order',
          targetId: existing.orderCode,
          details: `${existing.orderCode}: ${existing.orderStatus} -> ${nextStatus} (via Telegram Bot)`,
        });

        await bot.api.answerCallbackQuery(cq.id, {
          text: `Order ${existing.orderCode} -> ${nextStatus}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
