'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowLeft, QrCode, Loader2 } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { useCart } from '@/components/CartContext';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';

interface CreatedPayment {
  orderId: number;
  orderCode: string;
  transactionRef: string;
  provider: string;
  qrDataUrl: string;
  amountCents: number;
  currency: string;
}

export default function CheckoutPage() {
  const { items, totalCents, currency, clearCart } = useCart();
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<CreatedPayment | null>(null);
  const [paid, setPaid] = useState(false);

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

      setPaymentInfo({
        orderId: data.order.id,
        orderCode: data.order.orderCode,
        transactionRef: data.payment.transactionRef,
        provider: data.payment.provider,
        qrDataUrl: data.payment.qrDataUrl,
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

  return (
    <div className="min-h-screen pb-16">
      <TopNav />

      <main className="mx-auto max-w-xl px-4 py-5">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to shop</span>
        </Link>

        {paid && paymentInfo ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-3 text-xl font-bold text-slate-900">Payment Confirmed!</h1>
            <p className="mt-1 text-sm text-slate-600">
              Order <span className="font-mono font-semibold">{paymentInfo.orderCode}</span> has been
              sent to our seller team. You will receive Telegram updates as it ships.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/orders"
                className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                View My Orders
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        ) : paymentInfo ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <QrCode className="h-4 w-4" />
              <span>Scan to Pay ({paymentInfo.provider.toUpperCase()})</span>
            </div>

            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              {formatMoney(paymentInfo.amountCents, paymentInfo.currency)}
            </h1>
            <p className="text-xs text-slate-500">Ref: {paymentInfo.transactionRef}</p>

            <div className="my-5 flex justify-center">
              <img
                src={paymentInfo.qrDataUrl}
                alt="Payment QR Code"
                className="h-64 w-64 rounded-2xl border border-slate-200 p-2"
              />
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
              <span>Waiting for bank confirmation...</span>
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>
            )}

            {paymentInfo.provider === 'manual' && (
              <button
                type="button"
                onClick={handleSimulatePayment}
                className="mt-5 w-full rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Simulate / Confirm Payment (Dev Test)
              </button>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Your cart is empty.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h1 className="text-lg font-bold text-slate-900">Delivery & Checkout</h1>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between py-1.5">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span className="font-semibold">
                    {formatMoney(item.priceCents * item.quantity, item.currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-bold text-slate-900">
                <span>Total</span>
                <span>{formatMoney(totalCents, currency)}</span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Recipient Name (optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Uses your Telegram name if empty"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 012 345 678"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Delivery Address *
              </label>
              <textarea
                required
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House #, Street, Sangkat, Khan, City"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Note for Seller (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Call before delivery, etc."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting ? 'Generating QR...' : `Pay ${formatMoney(totalCents, currency)}`}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
