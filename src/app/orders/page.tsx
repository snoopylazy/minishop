'use client';

import React, { useEffect, useState } from 'react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';

interface OrderItem {
  id: number;
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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orders', { headers: getTelegramAuthHeaders() })
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data) => setOrders(data.orders ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-5">
        <h1 className="mb-4 text-xl font-bold text-slate-900">My Orders</h1>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="h-28 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No orders found yet.
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {order.orderCode}
                  </span>
                  <div className="flex gap-2 text-xs font-semibold">
                    <span
                      className={`rounded-full px-2.5 py-0.5 ${
                        order.paymentStatus === 'paid'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 capitalize text-sky-700">
                      {order.orderStatus}
                    </span>
                  </div>
                </div>

                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.productName} × {item.quantity}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span className="line-clamp-1 max-w-[65%]">{order.address}</span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatMoney(order.totalCents, order.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
