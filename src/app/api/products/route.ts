import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('all') === '1';

  if (includeInactive) {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const products = await db.orm.public.Product.orderBy((p) => p.id.desc()).all();
    return NextResponse.json({ products });
  }

  const products = await db.orm.public.Product
    .where({ isActive: true })
    .orderBy((p) => p.id.desc())
    .all();

  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    priceCents?: number;
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
    priceCents: Math.round(body.priceCents),
    currency: body.currency === 'KHR' ? 'KHR' : 'USD',
    stock: typeof body.stock === 'number' ? Math.max(0, Math.round(body.stock)) : 0,
    imageUrl: body.imageUrl?.trim() || null,
    isActive: true,
  });

  return NextResponse.json({ product }, { status: 201 });
}
