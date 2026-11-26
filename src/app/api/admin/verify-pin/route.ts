import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

async function getExpectedPinForUser(telegramId: string, staffRole: string | null): Promise<string | null> {
  if (staffRole && staffRole !== 'super_admin') {
    const staff = await db.orm.public.StaffUser
      .where({ telegramId })
      .first()
      .catch(() => null);
    const userPin = staff?.pin?.trim();
    if (userPin === 'OFF') return null;
    if (userPin) return userPin;
  }

  const settings = await db.orm.public.ShopSettings
    .orderBy((s) => s.id.asc())
    .first()
    .catch(() => null);
  const dbPin = settings?.adminPin?.trim();
  if (dbPin === 'OFF') return null;
  if (dbPin) return dbPin;

  return process.env.ADMIN_PIN?.trim() || null;
}

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin', 'seller'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const expected = await getExpectedPinForUser(auth.telegramUser.id, auth.staffRole);
  return NextResponse.json({
    pinRequired: Boolean(expected),
  });
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin', 'seller'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const expected = await getExpectedPinForUser(auth.telegramUser.id, auth.staffRole);
  if (!expected) {
    return NextResponse.json({ ok: true });
  }

  const body = (await request.json()) as { pin?: string };
  const provided = body.pin?.trim() ?? '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
