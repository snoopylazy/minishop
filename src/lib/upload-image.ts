import { getTelegramAuthHeaders } from '@/lib/client-telegram';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Uploads a resized data URL image to Cloudflare R2 via /api/upload.
 * Falls back to the data URL when R2 is not configured yet (503).
 */
export async function uploadDataUrlOrFallback(
  dataUrl: string,
  folder: 'products' | 'qr',
): Promise<{ url: string; storedInR2: boolean }> {
  const blob = dataUrlToBlob(dataUrl);
  const formData = new FormData();
  formData.append('file', new File([blob], `${folder}.jpg`, { type: blob.type || 'image/jpeg' }));
  formData.append('folder', folder);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: getTelegramAuthHeaders(),
    body: formData,
  });

  if (res.ok) {
    const data = (await res.json()) as { url: string };
    return { url: data.url, storedInR2: true };
  }

  if (res.status === 503) {
    return { url: dataUrl, storedInR2: false };
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.error ?? 'Failed to upload image');
}
