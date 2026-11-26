'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Loader2, Trash2, QrCode, Upload, CheckCircle2, X, RotateCcw } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCart, type CartProduct } from '@/components/CartContext';
import { useLang } from '@/components/LanguageContext';

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

interface Order {
  id: number;
  orderCode: string;
  totalCents: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string;
  address: string;
  phone: string;
  createdAt: string;
  items: OrderItem[];
}

const PAYMENT_BADGE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-sky-50 text-sky-700 border-sky-200',
  preparing: 'bg-violet-50 text-violet-700 border-violet-200',
  shipped: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const STATUS_STEPS = ['new', 'preparing', 'shipped', 'delivered'] as const;

function OrderProgressBar({ status, t }: { status: string; t: (k: 'statusNew' | 'statusPreparing' | 'statusShipped' | 'statusDelivered' | 'statusCancelled') => string }) {
  if (status === 'cancelled') {
    return (
      <div className="mt-2.5 rounded-lg bg-slate-100 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-500">
        {t('statusCancelled')}
      </div>
    );
  }
  const activeIdx = Math.max(0, STATUS_STEPS.indexOf(status as (typeof STATUS_STEPS)[number]));
  const labels = [t('statusNew'), t('statusPreparing'), t('statusShipped'), t('statusDelivered')];

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-1">
        {STATUS_STEPS.map((step, idx) => {
          const done = idx <= activeIdx;
          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                    done ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className={`text-[10px] font-medium ${done ? 'text-sky-600' : 'text-slate-400'}`}>
                  {labels[idx]}
                </span>
              </div>
              {idx < STATUS_STEPS.length - 1 && (
                <div
                  className={`mb-4 h-0.5 flex-1 rounded-full ${
                    idx < activeIdx ? 'bg-sky-500' : 'bg-slate-100'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { addItem, updateQuantity } = useCart();
  const { t } = useLang();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [slipSent, setSlipSent] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<number | null>(null);

  const handleReorder = async (order: Order) => {
    setReorderingId(order.id);
    try {
      const res = await fetch('/api/products?limit=100');
      const data = await res.json();
      const catalog = (data.products ?? []) as CartProduct[];
      const map = new Map(catalog.map((p) => [p.id, p]));

      let added = 0;
      for (const item of order.items) {
        const prod = map.get(item.productId);
        if (prod && prod.stock > 0) {
          addItem(prod);
          if (item.quantity > 1) {
            updateQuantity(prod.id, Math.min(item.quantity, prod.stock));
          }
          added++;
        }
      }
      if (added > 0) {
        router.push('/checkout');
      } else {
        window.alert('These items are currently out of stock.');
      }
    } finally {
      setReorderingId(null);
    }
  };

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setQrImageUrl(data.paymentQrImageUrl ?? null);
          setPaymentNote(data.paymentNote ?? null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!payingOrder) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${payingOrder.id}/status`, {
          headers: getTelegramAuthHeaders(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { paymentStatus?: string };
        if (data.paymentStatus === 'paid') {
          setOrders((prev) =>
            prev.map((o) => (o.id === payingOrder.id ? { ...o, paymentStatus: 'paid' } : o)),
          );
          setPayingOrder(null);
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [payingOrder]);

  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !payingOrder) return;
    setPayError(null);
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

      const res = await fetch(`/api/orders/${payingOrder.id}/slip`, {
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
        setPayError(data.error ?? 'Failed to upload payment slip');
      }
    } catch {
      setPayError('Could not process payment slip image');
    } finally {
      setUploadingSlip(false);
    }
  };

  const fetchOrders = useCallback(async (pageNum: number, replace: boolean) => {
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch(`/api/orders?page=${pageNum}&limit=20`, { headers: getTelegramAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setOrders((prev) => replace ? (data.orders ?? []) : [...prev, ...(data.orders ?? [])]);
      setHasMore(data.hasMore ?? false);
      setPage(pageNum);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchOrders(1, true); }, [fetchOrders]);

  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) fetchOrders(page + 1, false);
  }, hasMore && !loadingMore);

  const removeUnpaidOrder = async (order: Order) => {
    if (!window.confirm(`Remove unpaid order ${order.orderCode}?`)) return;
    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'DELETE',
      headers: getTelegramAuthHeaders(),
    });
    if (res.ok) {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-5">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToShop')}
        </Link>

        <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">{t('myOrders')}</h1>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="h-28 animate-pulse rounded-2xl bg-white border border-slate-100" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-slate-100 p-5">
              <Package className="h-9 w-9 text-slate-300" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">{t('noOrders')}</p>
              <p className="mt-0.5 text-sm text-slate-400">{t('noOrdersDesc')}</p>
            </div>
            <Link
              href="/"
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
            >
              {t('startShopping')}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {orders.map((order) => (              <div
                key={order.id}
                className="overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
                  <span className="font-mono text-xs font-bold text-slate-700 tracking-wider">
                    {order.orderCode}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize ${PAYMENT_BADGE[order.paymentStatus] ?? PAYMENT_BADGE['pending']}`}
                    >
                      {order.paymentStatus === 'paid' ? t('paid') : t('pending')}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize ${STATUS_BADGE[order.orderStatus] ?? STATUS_BADGE['new']}`}
                    >
                      {order.orderStatus === 'preparing'
                        ? t('statusPreparing')
                        : order.orderStatus === 'shipped'
                          ? t('statusShipped')
                          : order.orderStatus === 'delivered'
                            ? t('statusDelivered')
                            : order.orderStatus === 'cancelled'
                              ? t('statusCancelled')
                              : t('statusNew')}
                    </span>
                  </div>
                </div>

                {/* Items + Progress Bar */}
                <div className="px-4 py-2.5">
                  <ul className="space-y-0.5">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between text-xs text-slate-600">
                        <span>{item.productName} <span className="text-slate-400">× {item.quantity}</span></span>
                        <span className="font-medium">{formatMoney(item.unitPriceCents * item.quantity, order.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <OrderProgressBar status={order.orderStatus} t={t} />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50 px-4 py-2.5">
                  <div>
                    <p className="line-clamp-1 max-w-[200px] text-[11px] text-slate-400">{order.address}</p>
                    <p className="text-[11px] text-slate-400">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={reorderingId === order.id}
                      onClick={() => handleReorder(order)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{t('reorder')}</span>
                    </button>
                    {order.paymentStatus !== 'paid' && order.orderStatus !== 'cancelled' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPayingOrder(order);
                            setSlipSent(false);
                            setPayError(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-600 transition-colors"
                        >
                          <QrCode className="h-3 w-3" />
                          <span>{t('payNow')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeUnpaidOrder(order)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{t('remove')}</span>
                        </button>
                      </>
                    )}
                    <span className="text-sm font-bold text-slate-900">
                      {formatMoney(order.totalCents, order.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="mt-4 flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
            </div>
          )}
            {!hasMore && orders.length > 0 && (
              <p className="mt-4 text-center text-xs text-slate-300">{t('allOrdersLoaded')}</p>
            )}
          </>
        )}
      </main>

      {payingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="font-mono text-xs font-bold text-slate-700">{payingOrder.orderCode}</p>
                <p className="text-lg font-bold text-sky-600">
                  {formatMoney(payingOrder.totalCents, payingOrder.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingOrder(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col items-center p-5 text-center">
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="Shop Payment QR"
                  className="max-h-64 w-auto rounded-2xl border-4 border-slate-100 p-1"
                />
              ) : (
                <div className="flex h-44 w-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
                  <QrCode className="mb-1 h-10 w-10 text-slate-300" />
                  <span className="text-xs">{t('noQrUploaded')}</span>
                </div>
              )}

              {paymentNote && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {paymentNote}
                </p>
              )}

              {payError && (
                <p className="mt-3 w-full rounded-xl bg-rose-50 p-2.5 text-xs font-medium text-rose-600">
                  {payError}
                </p>
              )}

              <div className="mt-4 w-full">
                {slipSent ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{t('slipSent')}</span>
                  </div>
                ) : (
                  <label className="btn-press flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors">
                    {uploadingSlip ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('sendingSlip')}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span>{t('uploadSlip')}</span>
                      </>
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
