import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

async function getCurrentActivePin(telegramId: string, staffRole: string | null): Promise<string | null> {
  if (staffRole && staffRole !== 'super_admin') {
    const staff = await db.orm.public.StaffUser.where({ telegramId }).first().catch(() => null);
    const userPin = staff?.pin?.trim();
    if (userPin === 'OFF') return null;
    if (userPin) return userPin;
  }
  const settings = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first().catch(() => null);
  const dbPin = settings?.adminPin?.trim();
  if (dbPin === 'OFF') return null;
  if (dbPin) return dbPin;
  return process.env.ADMIN_PIN?.trim() || null;
}

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let notifyOrders = true;
  let hasPin = Boolean(process.env.ADMIN_PIN?.trim());

  const settings = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first().catch(() => null);
  if (settings?.adminPin === 'OFF') {
    hasPin = false;
  } else if (settings?.adminPin) {
    hasPin = true;
  }

  if (auth.staffRole === 'super_admin') {
    notifyOrders = settings?.superAdminNotify ?? true;
  } else if (auth.staffRole) {
    const staff = await db.orm.public.StaffUser.where({ telegramId: auth.telegramUser.id }).first().catch(() => null);
    notifyOrders = staff?.notifyOrders ?? true;
    if (staff?.pin === 'OFF') hasPin = false;
    else if (staff?.pin) hasPin = true;
  }

  return NextResponse.json({ ...auth, notifyOrders, hasPin });
}

export async function PATCH(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin', 'seller'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as { notifyOrders?: boolean; pin?: string | null; currentPin?: string };

  if (typeof body.notifyOrders === 'boolean') {
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

  if (body.pin !== undefined) {
    const existingPin = await getCurrentActivePin(auth.telegramUser.id, auth.staffRole);
    if (existingPin) {
      const provided = body.currentPin?.trim() ?? '';
      const a = Buffer.from(provided);
      const b = Buffer.from(existingPin);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 });
      }
    }

    const nextPin = body.pin === null || body.pin.trim() === '' ? 'OFF' : body.pin.trim();
    if (nextPin !== 'OFF' && (nextPin.length < 4 || nextPin.length > 12)) {
      return NextResponse.json({ error: 'PIN must be 4 to 12 characters' }, { status: 400 });
    }

    if (auth.staffRole === 'super_admin') {
      const existing = await db.orm.public.ShopSettings.orderBy((s) => s.id.asc()).first();
      if (existing) {
        await db.orm.public.ShopSettings.where({ id: existing.id }).update({ adminPin: nextPin });
      } else {
        await db.orm.public.ShopSettings.create({ adminPin: nextPin });
      }
    } else {
      await db.orm.public.StaffUser.where({ telegramId: auth.telegramUser.id }).update({
        pin: nextPin,
      });
    }

    return NextResponse.json({ ok: true, hasPin: nextPin !== 'OFF' });
  }

  return NextResponse.json({ error: 'notifyOrders or pin is required' }, { status: 400 });
}
