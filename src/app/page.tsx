'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Minus, ShoppingBag } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { useCart, type CartProduct } from '@/components/CartContext';
import { formatMoney } from '@/lib/client-telegram';

interface Product extends CartProduct {
  description: string | null;
}

export default function StorefrontPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { items, addItem, updateQuantity, totalCents, totalCount, currency } = useCart();

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const getQty = (id: number) => items.find((i) => i.id === id)?.quantity ?? 0;

  return (
    <div className="min-h-screen pb-24">
      <TopNav />

      <main className="mx-auto max-w-2xl px-4 py-5">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            Browse items, add to cart, and pay with QR — no login required.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No products available yet. Admins can add products from the Admin panel.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => {
              const qty = getQty(product.id);
              const outOfStock = product.stock <= 0;

              return (
                <div
                  key={product.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div>
                    <div className="aspect-square w-full bg-slate-100">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h2 className="line-clamp-1 font-semibold text-slate-900">
                        {product.name}
                      </h2>
                      {product.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {product.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-bold text-sky-600">
                          {formatMoney(product.priceCents, product.currency)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {outOfStock ? 'Sold out' : `${product.stock} left`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-3">
                    {qty === 0 ? (
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => addItem(product)}
                        className="w-full rounded-xl bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {outOfStock ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, qty - 1)}
                          className="rounded-lg p-1.5 text-sky-700 hover:bg-sky-100"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-bold text-sky-900">{qty}</span>
                        <button
                          type="button"
                          disabled={qty >= product.stock}
                          onClick={() => updateQuantity(product.id, qty + 1)}
                          className="rounded-lg p-1.5 text-sky-700 hover:bg-sky-100 disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {totalCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <Link
              href="/checkout"
              className="flex w-full items-center justify-between rounded-2xl bg-sky-600 px-5 py-3.5 text-white shadow-lg transition hover:bg-sky-700"
            >
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingBag className="h-5 w-5" />
                <span>Checkout ({totalCount} items)</span>
              </span>
              <span className="text-lg font-bold">{formatMoney(totalCents, currency)}</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
