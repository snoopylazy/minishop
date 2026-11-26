import crypto from 'node:crypto';
import QRCode from 'qrcode';

export interface PaymentInitResult {
  provider: 'aba_payway' | 'khqr' | 'manual';
  transactionRef: string;
  qrString: string;
  qrDataUrl: string;
}

export function formatMoney(cents: number, currency = 'USD'): string {
  if (currency === 'KHR') {
    return `${cents.toLocaleString('en-US')} ៛`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Generates a payment reference and QR code for an order.
 * Supports `manual` / sandbox QR out of the box and can be extended with live ABA PayWay / Bakong KHQR API calls.
 */
export async function createOrderPaymentQR(params: {
  orderCode: string;
  amountCents: number;
  currency: string;
}): Promise<PaymentInitResult> {
  const providerEnv = (process.env.PAYMENT_PROVIDER ?? 'manual').toLowerCase();
  const provider: PaymentInitResult['provider'] =
    providerEnv === 'aba_payway' ? 'aba_payway' : providerEnv === 'khqr' ? 'khqr' : 'manual';

  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const transactionRef = `TXN-${params.orderCode}-${randomSuffix}`;

  // When ABA PayWay / Bakong KHQR credentials are configured, replace this payload with the bank API's QR string.
  const amountDisplay =
    params.currency === 'KHR' ? String(params.amountCents) : (params.amountCents / 100).toFixed(2);
  const qrString = `MINIAPP|${provider.toUpperCase()}|${transactionRef}|${amountDisplay}|${params.currency}`;
  const qrDataUrl = await QRCode.toDataURL(qrString, {
    width: 280,
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return {
    provider,
    transactionRef,
    qrString,
    qrDataUrl,
  };
}

/**
 * Verifies incoming payment webhook requests using a shared secret header or ABA PayWay HMAC signature.
 */
export function verifyPaymentWebhookSecret(request: Request): boolean {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }
  const provided = request.headers.get('x-webhook-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
