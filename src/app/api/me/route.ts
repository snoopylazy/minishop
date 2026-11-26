import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let notifyOrders = true;
  if (auth.staffRole === 'super_admin') {
    const settings = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first().catch(() => null);
    notifyOrders = settings?.superAdminNotify ?? true;
  } else if (auth.staffRole) {
    const staff = await db.orm.public.StaffUser.where({ telegramId: auth.telegramUser.id }).first().catch(() => null);
    notifyOrders = staff?.notifyOrders ?? true;
  }

  return NextResponse.json({ ...auth, notifyOrders });
}

export async function PATCH(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin', 'seller'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as { notifyOrders?: boolean };
  if (typeof body.notifyOrders !== 'boolean') {
    return NextResponse.json({ error: 'notifyOrders boolean is required' }, { status: 400 });
  }

  if (auth.staffRole === 'super_admin') {
    const existing = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first();
    if (existing) {
      await db.orm.public.ShopSettings.where({ id: existing.id }).update({
        superAdminNotify: body.notifyOrders,
      });
    } else {
      await db.orm.public.ShopSettings.create({
        superAdminNotify: body.notifyOrders,
      });
    }
  } else {
    await db.orm.public.StaffUser.where({ telegramId: auth.telegramUser.id }).update({
      notifyOrders: body.notifyOrders,
    });
  }

  return NextResponse.json({ notifyOrders: body.notifyOrders });
}
