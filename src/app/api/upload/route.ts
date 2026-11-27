import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { isR2Configured, uploadToR2 } from '@/lib/r2';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured yet.' },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const rawFolder = String(formData.get('folder') ?? 'products');
    const folder = /^[a-z0-9_-]+$/i.test(rawFolder) ? rawFolder : 'products';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Image size must be 5 MB or less.' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const key = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const url = await uploadToR2({
      buffer: Buffer.from(arrayBuffer),
      contentType: file.type,
      key,
    });

    return NextResponse.json({ url, key }, { status: 201 });
  } catch (error) {
    console.error('POST /api/upload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload image.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
