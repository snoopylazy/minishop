import { Bot, InlineKeyboard } from 'grammy';
import { db } from '@/prisma/db';
import { formatMoney } from '@/lib/payment';

let botInstance: Bot | null = null;

export function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.includes('replace-with')) {
    return null;
  }
  if (!botInstance) {
    botInstance = new Bot(token);
  }
  return botInstance;
}

export interface OrderNotificationItem {
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderNotificationData {
  id: number;
  orderCode: string;
  customerTelegramId: string;
  customerUsername: string | null;
  customerName: string;
  phone: string;
  address: string;
  note: string | null;
  totalCents: number;
  currency: string;
  orderStatus: string;
}

function formatItemsLines(items: OrderNotificationItem[], currency: string): string {
  return items
    .map((item) => `• ${item.productName} × ${item.quantity} (${formatMoney(item.unitPriceCents * item.quantity, currency)})`)
    .join('\n');
}

/**
 * Sends an order confirmation message to the customer after payment succeeds.
 */
export async function notifyCustomerOrderPaid(
  order: OrderNotificationData,
  items: OrderNotificationItem[],
): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const text = [
    `✅ *Payment Confirmed!*`,
    `Order: \`${order.orderCode}\``,
    ``,
    `*Items:*`,
    formatItemsLines(items, order.currency),
    ``,
    `*Total Paid:* ${formatMoney(order.totalCents, order.currency)}`,
    `*Delivery Address:* ${order.address}`,
    `*Phone:* ${order.phone}`,
    ``,
    `We will notify you when the seller prepares and ships your order.`,
  ].join('\n');

  try {
    await bot.api.sendMessage(order.customerTelegramId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Failed to notify customer:', err);
  }
}

/**
 * Sends a new paid order alert to all active staff (super_admin, admin, seller) with inline fulfillment buttons.
 */
export async function notifyStaffNewOrder(
  order: OrderNotificationData,
  items: OrderNotificationItem[],
): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const recipientIds = new Set<string>();
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.trim();
  if (superAdminId) {
    recipientIds.add(superAdminId);
  }

  try {
    const activeStaff = await db.orm.public.StaffUser.where({ isActive: true }).all();
    for (const staff of activeStaff) {
      recipientIds.add(staff.telegramId);
    }
  } catch (err) {
    console.error('Failed to query staff users:', err);
  }

  const customerTag = order.customerUsername ? `@${order.customerUsername}` : order.customerName;
  const text = [
    `🛒 *New Paid Order: ${order.orderCode}*`,
    `Customer: ${order.customerName} (${customerTag})`,
    `Phone: ${order.phone}`,
    `Address: ${order.address}`,
    order.note ? `Note: ${order.note}` : null,
    ``,
    `*Items:*`,
    formatItemsLines(items, order.currency),
    ``,
    `*Total:* ${formatMoney(order.totalCents, order.currency)}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const keyboard = new InlineKeyboard()
    .text('📦 Mark Preparing', `order_status:${order.id}:preparing`)
    .text('🚚 Mark Shipped', `order_status:${order.id}:shipped`)
    .row()
    .text('✅ Mark Delivered', `order_status:${order.id}:delivered`);

  await Promise.allSettled(
    Array.from(recipientIds).map((chatId) =>
      bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }),
    ),
  );
}

/**
 * Notifies the customer when a seller or admin updates their order status.
 */
export async function notifyCustomerOrderStatus(order: {
  orderCode: string;
  customerTelegramId: string;
  orderStatus: string;
}): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const statusEmoji: Record<string, string> = {
    preparing: '📦 Your order is being prepared.',
    shipped: '🚚 Your order has been shipped!',
    delivered: '🎉 Your order has been delivered. Thank you!',
    cancelled: '❌ Your order was cancelled.',
  };

  const message = statusEmoji[order.orderStatus] ?? `Order status updated to: ${order.orderStatus}`;
  try {
    await bot.api.sendMessage(
      order.customerTelegramId,
      `Order \`${order.orderCode}\`: ${message}`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    console.error('Failed to notify customer status update:', err);
  }
}
