'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface OrderItem {
  id: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
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
}

export default function AdminOrdersPage() {
  const [role, setRole] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
      const meRes = await fetch('/api/me', { headers });
      if (!meRes.ok) {
        setRole(null);
        setLoading(false);
        return;
      }
      const me = await meRes.json();
      setRole(me.staffRole ?? null);
      setTelegramId(me.telegramUser?.id ?? null);

      if (me.staffRole) {
        await fetchOrdersPage(1, true);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [fetchOrdersPage]);

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
    if (!window.confirm(`Delete order ${order.orderCode}?`)) return;
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
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Staff Dashboard</h1>
                <p className="text-xs text-slate-500">
                  Signed in as <span className="font-semibold capitalize">{role.replace('_', ' ')}</span>
                </p>
              </div>

              <div className="flex gap-2 text-xs font-semibold">
                <Link
                  href="/admin"
                  className="rounded-xl bg-sky-600 px-3 py-2 text-white"
                >
                  Orders
                </Link>
                {(role === 'super_admin' || role === 'admin') && (
                  <>
                    <Link
                      href="/admin/products"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      Products
                    </Link>
                    <Link
                      href="/admin/settings"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      Payment QR
                    </Link>
                  </>
                )}
                {role === 'super_admin' && (
                  <>
                    <Link
                      href="/admin/staff"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      Staff & Roles
                    </Link>
                    <Link
                      href="/admin/audit"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      Audit Log
                    </Link>
                  </>
                )}
              </div>
            </div>

            {orders.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">Total Orders</p>
                    <p className="text-lg font-bold text-slate-900">{orders.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">Paid Revenue (USD)</p>
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
                  placeholder="Search by order code, customer name, or phone..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-sky-500"
                />

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {['all', 'new', 'preparing', 'shipped', 'delivered', 'unpaid', 'cancelled'].map((tab) => (
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
                      {tab}
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
                    No matching orders.
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
                      {order.paymentStatus !== 'paid' ? (
                        <button
                          type="button"
                          onClick={() => confirmManualPaid(order.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Confirm Paid
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Payment verified</span>
                      )}

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
    </div>
  );
}
