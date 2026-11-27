import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const existing = await db.orm.public.Category.where({ id: categoryId }).first();
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    nameKm?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };

  const updateData: {
    name?: string;
    nameKm?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  } = {};

  const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;
  if (nextName && nextName !== existing.name) {
    const dup = await db.orm.public.Category.where({ name: nextName }).first();
    if (dup) {
      return NextResponse.json({ error: 'Category name already exists.' }, { status: 409 });
    }
    updateData.name = nextName;
  }
  if (body.nameKm !== undefined) updateData.nameKm = body.nameKm?.trim() || null;
  if (typeof body.sortOrder === 'number') updateData.sortOrder = Math.round(body.sortOrder);
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive;

  const category = await db.orm.public.Category.where({ id: categoryId }).update(updateData);

  // Keep existing products in sync when category is renamed
  if (nextName && nextName !== existing.name) {
    const affected = await db.orm.public.Product.where({ category: existing.name }).all();
    for (const p of affected) {
      await db.orm.public.Product.where({ id: p.id }).update({ category: nextName });
    }
  }

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'admin',
    action: 'category.updated',
    targetType: 'settings',
    targetId: categoryId,
    details: `Updated category #${categoryId} (${category?.name ?? existing.name})`,
  });

  return NextResponse.json({ category });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  const existing = await db.orm.public.Category.where({ id: categoryId }).first();
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  const affected = await db.orm.public.Product.where({ category: existing.name }).all();
  for (const p of affected) {
    await db.orm.public.Product.where({ id: p.id }).update({ category: null });
  }

  await db.orm.public.Category.where({ id: categoryId }).delete();

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'admin',
    action: 'category.deleted',
    targetType: 'settings',
    targetId: categoryId,
    details: `Deleted category "${existing.name}"`,
  });

  return NextResponse.json({ deleted: true });
}
