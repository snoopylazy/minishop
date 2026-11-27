import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ activeCustomerOrders: 0, newOrders: 0, lowStock: 0 });
    }

    const isStaff = hasRole(auth.staffRole, ['super_admin', 'admin', 'seller']);

    const customerOrders = await db.orm.public.Order
      .where({ customerTelegramId: auth.telegramUser.id })
      .all();

    const activeCustomerOrders = customerOrders.filter(
      (o) => o.orderStatus !== 'delivered' && o.orderStatus !== 'cancelled',
    ).length;

    if (!isStaff) {
      return NextResponse.json({ activeCustomerOrders, newOrders: 0, lowStock: 0 });
    }

    const [newOrdersList, activeProducts] = await Promise.all([
      db.orm.public.Order.where({ orderStatus: 'new' }).all(),
      db.orm.public.Product.where({ isActive: true }).all(),
    ]);

    const lowStock = activeProducts.filter((p) => p.stock <= 5).length;

    return NextResponse.json({
      activeCustomerOrders,
      newOrders: newOrdersList.length,
      lowStock,
    });
  } catch {
    return NextResponse.json({ activeCustomerOrders: 0, newOrders: 0, lowStock: 0 });
  }
}
