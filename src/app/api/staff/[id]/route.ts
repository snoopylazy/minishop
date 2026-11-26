import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const staffId = Number(id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 });
  }

  const body = (await request.json()) as {
    role?: string;
    isActive?: boolean;
    name?: string;
  };

  const updateData: { role?: string; isActive?: boolean; name?: string } = {};
  if (body.role === 'admin' || body.role === 'seller') {
    updateData.role = body.role;
  }
  if (typeof body.isActive === 'boolean') {
    updateData.isActive = body.isActive;
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    updateData.name = body.name.trim();
  }

  const updated = await db.orm.public.StaffUser
    .where({ id: staffId })
    .update(updateData);

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'super_admin',
    action: 'staff.updated',
    targetType: 'staff',
    targetId: updated?.telegramId ?? staffId,
    details: `Updated staff ${updated?.name ?? `#${staffId}`} (${JSON.stringify(updateData)})`,
  });

  return NextResponse.json({ staff: updated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const staffId = Number(id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 });
  }

  const existing = await db.orm.public.StaffUser.where({ id: staffId }).first();
  await db.orm.public.StaffUser.where({ id: staffId }).delete();

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'super_admin',
    action: 'staff.deleted',
    targetType: 'staff',
    targetId: existing?.telegramId ?? staffId,
    details: `Deleted staff ${existing?.name ?? `#${staffId}`}`,
  });

  return NextResponse.json({ ok: true });
}
