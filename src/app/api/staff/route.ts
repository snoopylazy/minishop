import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const staff = await db.orm.public.StaffUser
    .orderBy((s) => s.createdAt.desc())
    .all();

  return NextResponse.json({
    staff,
    superAdminTelegramId: process.env.SUPER_ADMIN_TELEGRAM_ID ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as {
    telegramId?: string;
    name?: string;
    username?: string;
    role?: string;
  };

  const telegramId = body.telegramId?.trim();
  const name = body.name?.trim();
  const role = body.role === 'admin' ? 'admin' : body.role === 'seller' ? 'seller' : null;

  if (!telegramId || !name || !role) {
    return NextResponse.json(
      { error: 'telegramId, name, and role (admin or seller) are required' },
      { status: 400 },
    );
  }

  const existing = await db.orm.public.StaffUser.where({ telegramId }).first();
  if (existing) {
    const updated = await db.orm.public.StaffUser.where({ id: existing.id }).update({
      name,
      username: body.username?.trim().replace(/^@/, '') || null,
      role,
      isActive: true,
    });
    return NextResponse.json({ staff: updated });
  }

  const created = await db.orm.public.StaffUser.create({
    telegramId,
    name,
    username: body.username?.trim().replace(/^@/, '') || null,
    role,
    isActive: true,
    createdBy: auth.telegramUser.id,
  });

  return NextResponse.json({ staff: created }, { status: 201 });
}
