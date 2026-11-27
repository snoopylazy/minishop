import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('all') === '1';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  if (includeInactive) {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const all = await db.orm.public.Product.orderBy((p) => p.id.desc()).all();
    const products = all.slice(offset, offset + limit);
    return NextResponse.json({ products, page, limit, total: all.length, hasMore: offset + limit < all.length });
  }

  const all = await db.orm.public.Product
    .where({ isActive: true })
    .orderBy((p) => p.id.desc())
    .all();
  const products = all.slice(offset, offset + limit);

  return NextResponse.json({ products, page, limit, total: all.length, hasMore: offset + limit < all.length });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      category?: string;
      variants?: string | null;
      priceCents?: number;
      compareAtPriceCents?: number | null;
      currency?: string;
      stock?: number;
      imageUrl?: string;
    };

    if (!body.name?.trim() || typeof body.priceCents !== 'number' || body.priceCents <= 0) {
      return NextResponse.json({ error: 'Valid name and priceCents are required' }, { status: 400 });
    }

    const product = await db.orm.public.Product.create({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      category: body.category?.trim() || null,
      variants: body.variants?.trim() || null,
      priceCents: Math.round(body.priceCents),
      compareAtPriceCents:
        typeof body.compareAtPriceCents === 'number' && body.compareAtPriceCents > 0
          ? Math.round(body.compareAtPriceCents)
          : null,
      currency: body.currency === 'KHR' ? 'KHR' : 'USD',
      stock: typeof body.stock === 'number' ? Math.max(0, Math.round(body.stock)) : 0,
      imageUrl: body.imageUrl?.trim() || null,
      isActive: true,
    });

    await recordAuditLog({
      actorTelegramId: auth.telegramUser.id,
      actorName: auth.telegramUser.fullName,
      actorRole: auth.staffRole ?? 'admin',
      action: 'product.created',
      targetType: 'product',
      targetId: product.id,
      details: `Created "${product.name}" (stock: ${product.stock})`,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/products error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
