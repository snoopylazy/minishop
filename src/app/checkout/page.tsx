'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowLeft, QrCode, Loader2, Upload, FlaskConical, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { useCart } from '@/components/CartContext';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useLang } from '@/components/LanguageContext';

interface CreatedPayment {
  orderId: number;
  orderCode: string;
  transactionRef: string;
  provider: string;
  qrDataUrl: string;
  customQrImageUrl?: string | null;
  paymentNote?: string | null;
  amountCents: number;
  currency: string;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 placeholder:text-slate-300';

const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide uppercase';

export default function CheckoutPage() {
  const { items, totalCents, currency, updateQuantity, clearCart } = useCart();
  const { t } = useLang();
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0);
  const [freeThresholdCents, setFreeThresholdCents] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<CreatedPayment | null>(null);
  const [paid, setPaid] = useState(false);
  const [slipSent, setSlipSent] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);

  // Load saved customer phone/address & shop delivery fee
  useEffect(() => {
    try {
      const saved = localStorage.getItem('miniapp_checkout_profile');
      if (saved) {
        const parsed = JSON.parse(saved) as { customerName?: string; phone?: string; address?: string };
        if (parsed.customerName) setCustomerName(parsed.customerName);
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.address) setAddress(parsed.address);
      }
    } catch {
      // Ignore storage error
    }

    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setDeliveryFeeCents(data.deliveryFeeCents ?? 0);
          setFreeThresholdCents(data.freeDeliveryThresholdCents ?? null);
        }
      })
      .catch(() => {});
  }, []);

  const effectiveDeliveryFee =
    deliveryFeeCents > 0 && freeThresholdCents && totalCents >= freeThresholdCents
      ? 0
      : deliveryFeeCents;
  const grandTotalCents = totalCents + effectiveDeliveryFee;

  // Poll payment status every 3 seconds once QR is displayed
  useEffect(() => {
    if (!paymentInfo || paid) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${paymentInfo.orderId}/status`, {
          headers: getTelegramAuthHeaders(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { paymentStatus?: string };
        if (data.paymentStatus === 'paid') {
          setPaid(true);
          clearCart();
        }
      } catch {
        // Ignore transient polling error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymentInfo, paid, clearCart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({
          customerName,
          phone,
          address,
          note,
          items: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create order');
        return;
      }

      try {
        localStorage.setItem(
          'miniapp_checkout_profile',
          JSON.stringify({ customerName, phone, address }),
        );
      } catch {
        // Ignore storage error
      }

      setPaymentInfo({
        orderId: data.order.id,
        orderCode: data.order.orderCode,
        transactionRef: data.payment.transactionRef,
        provider: data.payment.provider,
        qrDataUrl: data.payment.qrDataUrl,
        customQrImageUrl: data.payment.customQrImageUrl ?? null,
        paymentNote: data.payment.paymentNote ?? null,
        amountCents: data.payment.amountCents,
        currency: data.payment.currency,
      });
    } catch {
      setError('Network error while creating order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!paymentInfo) return;
    setError(null);
    const res = await fetch('/api/webhooks/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ transactionRef: paymentInfo.transactionRef }),
    });
    if (res.ok) {
      setPaid(true);
      clearCart();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not confirm test payment');
    }
  };

  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !paymentInfo) return;
    setError(null);
    setUploadingSlip(true);

    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('Invalid image'));
          img.onload = () => {
            const maxSide = 900;
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas error'));
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });

      const res = await fetch(`/api/orders/${paymentInfo.orderId}/slip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({ imageDataUrl }),
      });

      if (res.ok) {
        setSlipSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to upload payment slip');
      }
    } catch {
      setError('Could not process payment slip image');
    } finally {
      setUploadingSlip(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />

      <main className="mx-auto max-w-xl px-4 py-5">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('backToShop')}</span>
        </Link>

        {/* ── PAID SUCCESS ── */}
        {paid && paymentInfo ? (
          <div className="overflow-hidden rounded-2xl bg-white border border-emerald-100 shadow-sm">
            <div className="bg-emerald-50 p-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">{t('paymentConfirmed')}</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                <span className="font-mono font-bold text-slate-800">{paymentInfo.orderCode}</span> {t('paymentConfirmedDesc')}
              </p>
              <p className="mt-1 text-xs text-slate-400">{t('telegramUpdateDesc')}</p>
            </div>
            <div className="flex gap-3 p-4">
              <Link
                href="/orders"
                className="btn-press flex-1 rounded-xl bg-sky-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
              >
                {t('myOrders')}
              </Link>
              <Link
                href="/"
                className="btn-press flex-1 rounded-xl border border-slate-200 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {t('keepShopping')}
              </Link>
            </div>
          </div>

        /* ── QR CODE SCREEN ── */
        ) : paymentInfo ? (
          <div className="overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="border-b border-slate-100 p-4 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 mb-3">
                <QrCode className="h-3.5 w-3.5" />
                <span>{t('scanToPay')} — {paymentInfo.provider.toUpperCase()}</span>
              </div>
              <div className="text-3xl font-bold text-slate-900">
                {formatMoney(paymentInfo.amountCents, paymentInfo.currency)}
              </div>
              <p className="mt-1 text-[11px] text-slate-300 font-mono">Ref: {paymentInfo.transactionRef}</p>
            </div>

            <div className="flex flex-col items-center p-6 pb-4">
              <img
                src={paymentInfo.customQrImageUrl || paymentInfo.qrDataUrl}
                alt="Payment QR Code"
                className="max-h-72 w-auto rounded-2xl border-4 border-slate-100 p-1"
              />
              {paymentInfo.paymentNote && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {paymentInfo.paymentNote}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 pb-4 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
              <span>{t('waitingBank')}</span>
            </div>

            {error && (
              <div className="mx-4 mb-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-600">
                {error}
              </div>
            )}

            {paymentInfo.provider === 'manual' && (
              <div className="space-y-2.5 border-t border-slate-100 p-4">
                {slipSent ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{t('slipSent')}</span>
                  </div>
                ) : (
                  <label className="btn-press flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors">
                    {uploadingSlip ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {t('sendingSlip')}</>
                    ) : (
                      <><Upload className="h-4 w-4" /> {t('uploadSlip')}</>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSlipUpload}
                      disabled={uploadingSlip}
                      className="hidden"
                    />
                  </label>
                )}

                {/* <button
                  type="button"
                  onClick={handleSimulatePayment}
                  className="btn-press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <FlaskConical className="h-4 w-4" />
                  Simulate Payment (Dev)
                </button> */}

                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Cancel order ${paymentInfo.orderCode}?`)) return;
                    const res = await fetch(`/api/orders/${paymentInfo.orderId}`, {
                      method: 'DELETE',
                      headers: getTelegramAuthHeaders(),
                    });
                    if (res.ok) {
                      setPaymentInfo(null);
                    }
                  }}
                  className="w-full rounded-xl py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  {t('cancelOrder')}
                </button>
              </div>
            )}
          </div>

        /* ── EMPTY CART ── */
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">{t('emptyCart')}</p>
            <Link href="/" className="mt-4 inline-block text-sm font-semibold text-sky-500 hover:text-sky-600">
              {t('browseProducts')}
            </Link>
          </div>

        /* ── CHECKOUT FORM ── */
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Order summary */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('orderSummary')}</h2>
              </div>
              <div className="divide-y divide-slate-50 px-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatMoney(item.priceCents, item.currency)} {t('each')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
                        aria-label="Decrease"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[20px] text-center text-xs font-bold text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= item.stock}
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        aria-label="Increase"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 0)}
                        className="ml-1 rounded-lg p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="min-w-[60px] text-right font-semibold text-slate-900">
                      {formatMoney(item.priceCents * item.quantity, item.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{t('subtotal')}</span>
                  <span>{formatMoney(totalCents, currency)}</span>
                </div>
                {deliveryFeeCents > 0 && (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {t('deliveryFee')}
                      {freeThresholdCents ? ` (${t('freeOver')} ${formatMoney(freeThresholdCents, currency)})` : ''}
                    </span>
                    <span className={effectiveDeliveryFee === 0 ? 'font-semibold text-emerald-600' : ''}>
                      {effectiveDeliveryFee === 0 ? t('free') : formatMoney(effectiveDeliveryFee, currency)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-bold text-slate-900">{t('total')}</span>
                  <span className="text-base font-bold text-sky-600">{formatMoney(grandTotalCents, currency)}</span>
                </div>
              </div>
            </div>

            {/* Delivery info */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('deliveryInfo')}</h2>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className={labelClass}>{t('nameLabel')} <span className="text-slate-300 normal-case font-normal">({t('optional')})</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>{t('phone')} <span className="text-rose-400">*</span></label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="012 345 678"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>{t('address')} <span className="text-rose-400">*</span></label>
                  <textarea
                    required
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('addressPlaceholder')}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>{t('noteLabel')} <span className="text-slate-300 normal-case font-normal">({t('optional')})</span></label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('notePlaceholder')}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-xs font-medium text-rose-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-press w-full rounded-2xl bg-sky-500 py-3.5 text-sm font-bold text-white shadow-sm shadow-sky-200 transition hover:bg-sky-600 disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('generatingQr')}
                </span>
              ) : (
                `${t('pay')} ${formatMoney(grandTotalCents, currency)} →`
              )}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
