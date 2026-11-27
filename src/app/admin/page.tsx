'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Image as ImageIcon, X, CheckCircle2, Bell, BellOff, Lock } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLang } from '@/components/LanguageContext';
import { useUI } from '@/components/UIContext';

interface OrderItem {
  id: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

interface PaymentRecord {
  id: number;
  status: string;
  rawPayload: string | null;
}

interface Order {
  id: number;
  orderCode: string;
  customerName: string;
  customerUsername: string | null;
  phone: string;
  address: string;
  note: string | null;
  totalCents: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
  items: OrderItem[];
  payments?: PaymentRecord[];
}

function getSlipImageUrl(order: Order): string | null {
  const raw = order.payments?.[0]?.rawPayload;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { slipImageUrl?: string };
    return parsed.slipImageUrl ?? null;
  } catch {
    return null;
  }
}

export default function AdminOrdersPage() {
  const { t, lang } = useLang();
  const { confirm, toast } = useUI();
  const [role, setRole] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<string | null>(null);
  const [notifyOrders, setNotifyOrders] = useState<boolean>(true);
  const [togglingNotify, setTogglingNotify] = useState(false);
  const [hasPin, setHasPin] = useState<boolean>(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewingSlipOrder, setViewingSlipOrder] = useState<{ order: Order; url: string } | null>(null);

  const fetchOrdersPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const headers = getTelegramAuthHeaders();
      const ordersRes = await fetch(`/api/orders?page=${pageNum}&limit=20`, { headers });
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders((prev) => (replace ? (data.orders ?? []) : [...prev, ...(data.orders ?? [])]));
        setHasMore(data.hasMore ?? false);
        setPage(pageNum);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getTelegramAuthHeaders();
      const [meRes, ordersRes] = await Promise.all([
        fetch('/api/me', { headers }),
        fetch('/api/orders?page=1&limit=20', { headers }),
      ]);
      if (!meRes.ok) {
        setRole(null);
        return;
      }
      const me = await meRes.json();
      setRole(me.staffRole ?? null);
      setTelegramId(me.telegramUser?.id ?? null);
      setNotifyOrders(me.notifyOrders ?? true);
      setHasPin(me.hasPin ?? false);

      if (me.staffRole && ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders ?? []);
        setHasMore(data.hasMore ?? false);
        setPage(1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) fetchOrdersPage(page + 1, false);
  }, hasMore && !loadingMore);

  const updateOrderStatus = async (orderId: number, orderStatus: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ orderStatus }),
    });
    if (res.ok) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, orderStatus } : o)),
      );
    }
  };

  const confirmManualPaid = async (orderId: number) => {
    const res = await fetch('/api/webhooks/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ orderId }),
    });
    if (res.ok) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: 'paid' } : o)),
      );
    }
  };

  const deleteOrder = async (order: Order) => {
    const ok = await confirm(`Delete order ${order.orderCode}?`);
    if (!ok) return;
    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'DELETE',
      headers: getTelegramAuthHeaders(),
    });
    if (res.ok) {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      toast('Order deleted', 'success');
    }
  };

  const toggleMyAlerts = async () => {
    const next = !notifyOrders;
    setTogglingNotify(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({ notifyOrders: next }),
      });
      if (res.ok) {
        setNotifyOrders(next);
      }
    } finally {
      setTogglingNotify(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        ) : !role ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center text-sm text-rose-700">
            <p>Access denied. Only active Super Admin, Admin, or Seller accounts can view this page.</p>
            {telegramId && (
              <p className="mt-2 font-mono text-xs text-slate-600">
                Your Telegram ID: <strong>{telegramId}</strong>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-slate-900">{t('staffDashboard')}</h1>
                  <p className="text-[11px] sm:text-xs text-slate-500">
                    {t('signedInAs')} <span className="font-semibold capitalize">{role.replace('_', ' ')}</span>
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPin('');
                      setNewPin('');
                      setPinError(null);
                      setShowPinModal(true);
                    }}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      hasPin
                        ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Manage your PIN"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>{hasPin ? 'PIN ON' : 'PIN OFF'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={togglingNotify}
                    onClick={toggleMyAlerts}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      notifyOrders
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title="Toggle your Telegram order notifications"
                  >
                    {notifyOrders ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                    <span>{notifyOrders ? t('alertsOn') : t('alertsOff')}</span>
                  </button>
                </div>
              </div>
            </div>

            {orders.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">{t('totalOrders')}</p>
                    <p className="text-lg font-bold text-slate-900">{orders.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">{t('paidSales')}</p>
                    <p className="text-lg font-bold text-emerald-600">
                      {formatMoney(
                        orders
                          .filter((o) => o.paymentStatus === 'paid' && o.currency === 'USD')
                          .reduce((sum, o) => sum + o.totalCents, 0),
                        'USD',
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">Needs Action</p>
                    <p className="text-lg font-bold text-sky-600">
                      {orders.filter((o) => o.orderStatus === 'new' || o.orderStatus === 'preparing').length}
                    </p>
                  </div>
                </div>

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={lang === 'km' ? 'ស្វែងរកលេខកូដ ឈ្មោះ ឬលេខទូរស័ព្ទ...' : 'Search by order code, customer name, or phone...'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-sky-500"
                />

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {(['all', 'new', 'preparing', 'shipped', 'delivered', 'unpaid', 'cancelled'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setStatusFilter(tab)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                        statusFilter === tab
                          ? 'bg-sky-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tab === 'all'
                        ? t('allCategories')
                        : tab === 'new'
                          ? t('statusNew')
                          : tab === 'preparing'
                            ? t('statusPreparing')
                            : tab === 'shipped'
                              ? t('statusShipped')
                              : tab === 'delivered'
                                ? t('statusDelivered')
                                : tab === 'unpaid'
                                  ? t('pending')
                                  : t('statusCancelled')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const q = search.trim().toLowerCase();
              const filtered = orders.filter((o) => {
                if (statusFilter === 'unpaid' && o.paymentStatus === 'paid') return false;
                if (
                  statusFilter !== 'all' &&
                  statusFilter !== 'unpaid' &&
                  o.orderStatus !== statusFilter
                ) {
                  return false;
                }
                if (!q) return true;
                return (
                  o.orderCode.toLowerCase().includes(q) ||
                  o.customerName.toLowerCase().includes(q) ||
                  (o.customerUsername ?? '').toLowerCase().includes(q) ||
                  o.phone.toLowerCase().includes(q)
                );
              });

              if (filtered.length === 0) {
                return (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    {t('noMatchingOrders')}
                  </div>
                );
              }

              return (
              <div className="space-y-3">
                {filtered.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {order.orderCode}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          {order.customerName}
                          {order.customerUsername ? ` (@${order.customerUsername})` : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            order.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {order.paymentStatus}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {formatMoney(order.totalCents, order.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700">
                      <p>
                        <strong>Phone:</strong> {order.phone}
                      </p>
                      <p>
                        <strong>Address:</strong> {order.address}
                      </p>
                      {order.note && (
                        <p>
                          <strong>Note:</strong> {order.note}
                        </p>
                      )}
                      <ul className="mt-1.5 border-t border-slate-200 pt-1.5">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            • {item.productName} × {item.quantity}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {(() => {
                          const slipUrl = getSlipImageUrl(order);
                          return slipUrl ? (
                            <button
                              type="button"
                              onClick={() => setViewingSlipOrder({ order, url: slipUrl })}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              <span>{t('viewSlip')}</span>
                            </button>
                          ) : null;
                        })()}

                        {order.paymentStatus !== 'paid' ? (
                          <button
                            type="button"
                            onClick={() => confirmManualPaid(order.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            {t('confirmPaid')}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">{t('paymentVerified')}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {(role === 'super_admin' || role === 'admin') &&
                          (order.orderStatus === 'cancelled' || order.paymentStatus !== 'paid') && (
                            <button
                              type="button"
                              onClick={() => deleteOrder(order)}
                              className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Delete
                            </button>
                          )}

                        <select
                          value={order.orderStatus}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          <option value="new">New</option>
                          <option value="preparing">Preparing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              );
            })()}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
              <div className="mt-4 flex justify-center py-3">
                <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
              </div>
            )}
            {!hasMore && orders.length > 0 && (
              <p className="mt-4 text-center text-xs text-slate-400">All orders loaded</p>
            )}
          </>
        )}
      </main>

      {viewingSlipOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="font-mono text-xs font-bold text-slate-800">
                  {viewingSlipOrder.order.orderCode}
                </p>
                <p className="text-sm font-bold text-sky-600">
                  {formatMoney(viewingSlipOrder.order.totalCents, viewingSlipOrder.order.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingSlipOrder(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex max-h-[65vh] justify-center overflow-auto bg-slate-50 p-4">
              <img
                src={viewingSlipOrder.url}
                alt="Customer payment slip"
                className="max-h-[58vh] w-auto rounded-xl border border-slate-200 object-contain shadow-sm"
              />
            </div>

            {viewingSlipOrder.order.paymentStatus !== 'paid' && (
              <div className="flex gap-2.5 border-t border-slate-100 p-4">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(`/api/orders/${viewingSlipOrder.order.id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        ...getTelegramAuthHeaders(),
                      },
                      body: JSON.stringify({ action: 'reject_slip' }),
                    });
                    if (res.ok) {
                      setOrders((prev) =>
                        prev.map((o) =>
                          o.id === viewingSlipOrder.order.id ? { ...o, payments: [] } : o,
                        ),
                      );
                      setViewingSlipOrder(null);
                    }
                  }}
                  className="btn-press flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-100"
                >
                  {t('rejectSlip')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await confirmManualPaid(viewingSlipOrder.order.id);
                    setViewingSlipOrder(null);
                  }}
                  className="btn-press flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('confirmPaid')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {lang === 'km' ? 'គ្រប់គ្រងលេខកូដ PIN ផ្ទាល់ខ្លួន' : 'My Staff PIN'}
              </h2>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPinError(null);
                if (hasPin && !currentPin.trim()) {
                  setPinError(lang === 'km' ? 'សូមបញ្ចូល PIN បច្ចុប្បន្នជាមុន' : 'Enter current PIN to confirm');
                  return;
                }
                if (newPin.trim().length < 4 || newPin.trim().length > 12) {
                  setPinError(lang === 'km' ? 'PIN ត្រូវមាន 4 ទៅ 12 ខ្ទង់' : 'PIN must be 4-12 characters');
                  return;
                }
                setSavingPin(true);
                try {
                  const res = await fetch('/api/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                    body: JSON.stringify({ pin: newPin.trim(), currentPin: currentPin.trim() }),
                  });
                  if (res.ok) {
                    setHasPin(true);
                    try { sessionStorage.setItem('miniapp_admin_unlocked', '1'); } catch {}
                    setShowPinModal(false);
                    toast('PIN updated!', 'success');
                  } else {
                    const data = await res.json().catch(() => ({}));
                    setPinError(data.error ?? 'Failed to save PIN');
                  }
                } finally {
                  setSavingPin(false);
                }
              }}
              className="space-y-3"
            >
              {hasPin && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                    {lang === 'km' ? 'PIN បច្ចុប្បន្ន' : 'Current PIN'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    placeholder="••••"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-base font-bold tracking-widest outline-none focus:border-sky-400 focus:bg-white"
                  />
                </div>
              )}
              <input
                type="password"
                inputMode="numeric"
                placeholder={lang === 'km' ? 'បញ្ចូល PIN ថ្មី (4-12 ខ្ទង់)' : 'New PIN (4-12 characters)'}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-base font-bold tracking-widest outline-none focus:border-sky-400 focus:bg-white"
              />

              {pinError && <p className="text-xs font-medium text-rose-600">{pinError}</p>}

              <div className="flex gap-2">
                {hasPin && (
                  <button
                    type="button"
                    disabled={savingPin}
                    onClick={async () => {
                      setPinError(null);
                      if (!currentPin.trim()) {
                        setPinError(lang === 'km' ? 'សូមបញ្ចូល PIN បច្ចុប្បន្នដើម្បីបិទ' : 'Enter current PIN to turn off');
                        return;
                      }
                      setSavingPin(true);
                      try {
                        const res = await fetch('/api/me', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                          body: JSON.stringify({ pin: null, currentPin: currentPin.trim() }),
                        });
                        if (res.ok) {
                          setHasPin(false);
                          setShowPinModal(false);
                          toast('PIN turned off', 'info');
                        } else {
                          const data = await res.json().catch(() => ({}));
                          setPinError(data.error ?? 'Incorrect current PIN');
                        }
                      } finally {
                        setSavingPin(false);
                      }
                    }}
                    className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    {lang === 'km' ? 'បិទ PIN' : 'Turn Off PIN'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingPin}
                  className="flex-1 rounded-xl bg-sky-500 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {savingPin
                    ? lang === 'km' ? 'កំពុងរក្សាទុក…' : 'Saving…'
                    : hasPin
                      ? lang === 'km' ? 'កែប្រែ PIN' : 'Update PIN'
                      : lang === 'km' ? 'បើក PIN' : 'Set PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
