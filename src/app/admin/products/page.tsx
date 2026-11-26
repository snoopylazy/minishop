'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';

interface Product {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [stock, setStock] = useState('10');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadProducts = async () => {
    const res = await fetch('/api/products?all=1', { headers: getTelegramAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products ?? []);
    } else {
      setError('Admin or Super Admin access required.');
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numericPrice = Number(price);
    const priceCents = currency === 'KHR' ? Math.round(numericPrice) : Math.round(numericPrice * 100);

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({
        name,
        description,
        priceCents,
        currency,
        stock: Number(stock),
        imageUrl,
      }),
    });

    if (res.ok) {
      setName('');
      setDescription('');
      setPrice('');
      setImageUrl('');
      await loadProducts();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to create product');
    }
  };

  const toggleActive = async (product: Product) => {
    const res = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    if (res.ok) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p)),
      );
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Manage Products</h1>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Back to Orders
          </Link>
        </div>

        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-slate-900">Add New Product</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              placeholder="Product name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                required
                placeholder={currency === 'USD' ? 'Price (USD)' : 'Price (KHR)'}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'KHR')}
                className="rounded-xl border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </select>
            </div>
            <input
              type="number"
              required
              placeholder="Stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="url"
              placeholder="Image URL (optional)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Create Product
          </button>
        </form>

        <div className="space-y-2.5">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              <div>
                <p className="font-semibold text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">
                  {formatMoney(product.priceCents, product.currency)} • Stock: {product.stock}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(product)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  product.isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {product.isActive ? 'Active' : 'Hidden'}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
