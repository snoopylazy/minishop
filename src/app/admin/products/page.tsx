'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLang } from '@/components/LanguageContext';

interface Product {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
}

function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const maxSide = 600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminProductsPage() {
  const { t } = useLang();
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [stock, setStock] = useState('10');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadProducts = useCallback(async (pageNum = 1, replace = true) => {
    if (pageNum > 1) setLoadingMore(true);
    try {
      const res = await fetch(`/api/products?all=1&page=${pageNum}&limit=20`, {
        headers: getTelegramAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts((prev) => (replace ? (data.products ?? []) : [...prev, ...(data.products ?? [])]));
        setHasMore(data.hasMore ?? false);
        setPage(pageNum);
      } else {
        setError('Admin or Super Admin access required.');
      }
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(1, true);
  }, [loadProducts]);

  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) loadProducts(page + 1, false);
  }, hasMore && !loadingMore);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCategory('');
    setDescription('');
    setPrice('');
    setCompareAtPrice('');
    setCurrency('USD');
    setStock('10');
    setImageUrl('');
  };

  const toCents = (val: string, curr: 'USD' | 'KHR') => {
    const num = Number(val);
    if (!val.trim() || Number.isNaN(num) || num <= 0) return null;
    return curr === 'KHR' ? Math.round(num) : Math.round(num * 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const priceCents = toCents(price, currency);
    if (!priceCents) {
      setError('Please enter a valid price.');
      return;
    }
    const compareAtPriceCents = toCents(compareAtPrice, currency);

    const payload = {
      name,
      category: category.trim() || null,
      description: description.trim() || null,
      priceCents,
      compareAtPriceCents,
      currency,
      stock: Number(stock),
      imageUrl: imageUrl.trim() || null,
    };

    const res = await fetch(
      editingId ? `/api/products/${editingId}` : '/api/products',
      {
        method: editingId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify(payload),
      },
    );

    if (res.ok) {
      resetForm();
      await loadProducts();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to save product');
    }
  };

  const startEdit = (product: Product) => {
    const curr = product.currency === 'KHR' ? 'KHR' : 'USD';
    const formatInput = (cents: number | null) => {
      if (!cents) return '';
      return curr === 'KHR' ? String(cents) : (cents / 100).toFixed(2);
    };
    setEditingId(product.id);
    setName(product.name);
    setCategory(product.category ?? '');
    setDescription(product.description ?? '');
    setCurrency(curr);
    setPrice(formatInput(product.priceCents));
    setCompareAtPrice(formatInput(product.compareAtPriceCents));
    setStock(String(product.stock));
    setImageUrl(product.imageUrl ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    setError(null);
    const res = await fetch(`/api/products/${product.id}`, {
      method: 'DELETE',
      headers: getTelegramAuthHeaders(),
    });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not delete product');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setImageUrl(dataUrl);
    } catch {
      setError('Could not process image file');
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">{t('manageProducts')}</h1>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {t('backToOrders')}
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {editingId ? t('editProduct') : t('addNewProduct')}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                {t('cancelEdit')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              placeholder={t('productNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder={t('categoryPlaceholder')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                required
                placeholder={currency === 'USD' ? t('priceUsdPlaceholder') : t('priceKhrPlaceholder')}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'KHR')}
                disabled={Boolean(editingId)}
                className="rounded-xl border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </select>
            </div>
            <input
              type="number"
              step="0.01"
              placeholder={t('originalPricePlaceholder')}
              value={compareAtPrice}
              onChange={(e) => setCompareAtPrice(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="number"
              required
              placeholder={t('stockPlaceholder')}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('imagePlaceholder')}
                value={imageUrl.startsWith('data:') ? 'Uploaded photo ready' : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                {t('uploadBtn')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <input
            type="text"
            placeholder={t('descPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            {editingId ? t('saveChanges') : t('createProduct')}
          </button>
        </form>

        <div className="space-y-2.5">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[10px] text-slate-400">
                    No img
                  </div>
                )}
                <div>
                  <p className="font-semibold text-slate-900">
                    {product.name}{' '}
                    {product.category && (
                      <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {product.category}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatMoney(product.priceCents, product.currency)}
                    {product.compareAtPriceCents &&
                      product.compareAtPriceCents > product.priceCents && (
                        <span className="ml-1.5 line-through text-slate-400">
                          {formatMoney(product.compareAtPriceCents, product.currency)}
                        </span>
                      )}{' '}
                    • {t('stockLabel')}: {product.stock}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(product)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('editBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(product)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    product.isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {product.isActive ? t('activeBtn') : t('hiddenBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => deleteProduct(product)}
                  className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  {t('deleteLabel')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <div className="mt-4 flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
          </div>
        )}
        {!hasMore && products.length > 0 && (
          <p className="mt-4 text-center text-xs text-slate-400">All products loaded</p>
        )}
      </main>
    </div>
  );
}
