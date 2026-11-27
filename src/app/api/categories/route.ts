import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { recordAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeAll = searchParams.get('all') === '1';

  if (includeAll) {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const categories = await db.orm.public.Category
      .orderBy([(c) => c.sortOrder.asc(), (c) => c.id.asc()])
      .all();
    return NextResponse.json({ categories });
  }

  const categories = await db.orm.public.Category
    .where({ isActive: true })
    .orderBy([(c) => c.sortOrder.asc(), (c) => c.id.asc()])
    .all();

  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      nameKm?: string | null;
      sortOrder?: number;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const existing = await db.orm.public.Category.where({ name }).first();
    if (existing) {
      return NextResponse.json({ error: 'Category already exists.' }, { status: 409 });
    }

    const category = await db.orm.public.Category.create({
      name,
      nameKm: body.nameKm?.trim() || null,
      sortOrder: typeof body.sortOrder === 'number' ? Math.round(body.sortOrder) : 0,
      isActive: true,
    });

    await recordAuditLog({
      actorTelegramId: auth.telegramUser.id,
      actorName: auth.telegramUser.fullName,
      actorRole: auth.staffRole ?? 'admin',
      action: 'category.created',
      targetType: 'settings',
      targetId: category.id,
      details: `Created category "${category.name}"`,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('POST /api/categories error:', error);
    return NextResponse.json({ error: 'Failed to create category.' }, { status: 500 });
  }
}
