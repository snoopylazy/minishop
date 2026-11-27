import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim()?.replace(/\/+$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

/** Returns true when all required Cloudflare R2 environment variables are set. */
export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

/** Uploads an image buffer to Cloudflare R2 and returns its public URL. */
export async function uploadToR2(params: {
  buffer: Buffer;
  contentType: string;
  key: string;
}): Promise<string> {
  const cfg = getR2Config();
  if (!cfg) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return `${cfg.publicUrl}/${params.key}`;
}
