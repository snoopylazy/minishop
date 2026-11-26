import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/telegram-auth';

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(auth);
}
