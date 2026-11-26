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
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string | null;
    category?: string | null;
    priceCents?: number;
    compareAtPriceCents?: number | null;
    stock?: number;
    imageUrl?: string | null;
    isActive?: boolean;
  };

  const updateData: {
    name?: string;
    description?: string | null;
    category?: string | null;
    priceCents?: number;
    compareAtPriceCents?: number | null;
    stock?: number;
    imageUrl?: string | null;
    isActive?: boolean;
  } = {};

  if (typeof body.name === 'string' && body.name.trim()) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (body.category !== undefined) updateData.category = body.category?.trim() || null;
  if (typeof body.priceCents === 'number' && body.priceCents > 0) {
    updateData.priceCents = Math.round(body.priceCents);
  }
  if (body.compareAtPriceCents !== undefined) {
    updateData.compareAtPriceCents =
      typeof body.compareAtPriceCents === 'number' && body.compareAtPriceCents > 0
        ? Math.round(body.compareAtPriceCents)
        : null;
  }
  if (typeof body.stock === 'number' && body.stock >= 0) {
    updateData.stock = Math.round(body.stock);
  }
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl?.trim() || null;
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive;

  const product = await db.orm.public.Product
    .where({ id: productId })
    .update(updateData);

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'admin',
    action: 'product.updated',
    targetType: 'product',
    targetId: productId,
    details: `Updated product #${productId}${product?.name ? ` (${product.name})` : ''}`,
  });

  return NextResponse.json({ product });
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
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  const usedInOrder = await db.orm.public.OrderItem.where({ productId }).first();
  if (usedInOrder) {
    return NextResponse.json(
      { error: 'This product has existing orders. Hide it instead of deleting.' },
      { status: 400 },
    );
  }

  const existing = await db.orm.public.Product.where({ id: productId }).first();
  await db.orm.public.Product.where({ id: productId }).delete();

  await recordAuditLog({
    actorTelegramId: auth.telegramUser.id,
    actorName: auth.telegramUser.fullName,
    actorRole: auth.staffRole ?? 'admin',
    action: 'product.deleted',
    targetType: 'product',
    targetId: productId,
    details: `Deleted product #${productId}${existing?.name ? ` (${existing.name})` : ''}`,
  });

  return NextResponse.json({ ok: true });
}
