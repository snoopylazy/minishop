import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  const all = await db.orm.public.StaffUser
    .orderBy((s) => s.createdAt.desc())
    .all();

  const staff = all.slice(offset, offset + limit);

  return NextResponse.json({
    staff,
    page,
    limit,
    total: all.length,
    hasMore: offset + limit < all.length,
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
    await recordAuditLog({
      actorTelegramId: auth.telegramUser.id,
      actorName: auth.telegramUser.fullName,
      actorRole: auth.staffRole ?? 'super_admin',
      action: 'staff.updated',
      targetType: 'staff',
      targetId: telegramId,
      details: `Updated staff ${name} (${telegramId}) to ${role}`,
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

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'super_admin',
    action: 'staff.added',
    targetType: 'staff',
    targetId: telegramId,
    details: `Added staff ${name} (${telegramId}) as ${role}`,
  });

  return NextResponse.json({ staff: created }, { status: 201 });
}
