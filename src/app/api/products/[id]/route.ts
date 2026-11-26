import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

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
    priceCents?: number;
    stock?: number;
    imageUrl?: string | null;
    isActive?: boolean;
  };

  const updateData: {
    name?: string;
    description?: string | null;
    priceCents?: number;
    stock?: number;
    imageUrl?: string | null;
    isActive?: boolean;
  } = {};

  if (typeof body.name === 'string' && body.name.trim()) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (typeof body.priceCents === 'number' && body.priceCents > 0) {
    updateData.priceCents = Math.round(body.priceCents);
  }
  if (typeof body.stock === 'number' && body.stock >= 0) {
    updateData.stock = Math.round(body.stock);
  }
  if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl?.trim() || null;
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive;

  const product = await db.orm.public.Product
    .where({ id: productId })
    .update(updateData);

  return NextResponse.json({ product });
}
