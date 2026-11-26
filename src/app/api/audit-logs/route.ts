import { NextResponse } from 'next/server';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const targetType = searchParams.get('targetType')?.trim() || '';
  const offset = (page - 1) * limit;

  const all = targetType && targetType !== 'all'
    ? await db.orm.public.AuditLog
        .where({ targetType })
        .orderBy((l) => l.createdAt.desc())
        .all()
    : await db.orm.public.AuditLog
        .orderBy((l) => l.createdAt.desc())
        .all();

  const logs = all.slice(offset, offset + limit);

  return NextResponse.json({
    logs,
    page,
    limit,
    total: all.length,
    hasMore: offset + limit < all.length,
  });
}
