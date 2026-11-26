'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Minus, ShoppingCart, Sparkles, Loader2, Package, Search, X } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { useCart, type CartProduct } from '@/components/CartContext';
import { formatMoney } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface Product extends CartProduct {
  description: string | null;
  category: string | null;
  compareAtPriceCents: number | null;
}

export default function StorefrontPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { items, addItem, updateQuantity, totalCents, totalCount, currency } = useCart();

  const fetchProducts = useCallback(async (pageNum: number, replace: boolean) => {
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch(`/api/products?page=${pageNum}&limit=20`);
      const data = await res.json();
      setProducts((prev) => replace ? (data.products ?? []) : [...prev, ...(data.products ?? [])]);
      setHasMore(data.hasMore ?? false);
      setPage(pageNum);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchProducts(1, true); }, [fetchProducts]);

  // Reset to page 1 when category changes (client-side filter, no extra fetch needed)
  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) fetchProducts(page + 1, false);
  }, hasMore && !loadingMore);

  const categories = [
    'All',
    ...Array.from(
      new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c))),
    ),
  ];

  const visibleProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    if (!matchesCat) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q)
    );
  });

  const getQty = (id: number) => items.find((i) => i.id === id)?.quantity ?? 0;

  return (
    <div className="min-h-screen pb-28">
      <TopNav />

      <main className="mx-auto max-w-2xl px-4 py-5">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Pick what you love, we'll handle the rest.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {/* Category Tabs */}
        {categories.length > 1 && (
          <div className="mb-5 -mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  selectedCategory === cat
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-200'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-60 animate-pulse rounded-2xl bg-white border border-slate-100"
              />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-slate-100 p-5">
              <Sparkles className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">No products in this category yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((product) => {              const qty = getQty(product.id);
              const outOfStock = product.stock <= 0;
              const onSale =
                product.compareAtPriceCents !== null &&
                product.compareAtPriceCents > product.priceCents;

              return (
                <div
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200"
                >
                  {/* Image (tap for details) */}
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    className="relative aspect-square w-full bg-slate-50 overflow-hidden text-left"
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                        <Package className="h-7 w-7 text-slate-300" />
                        <span className="text-[10px] text-slate-300">No image</span>
                      </div>
                    )}

                    {/* SALE badge */}
                    {onSale && (
                      <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow">
                        SALE
                      </span>
                    )}

                    {/* Sold Out overlay */}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                        <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-bold text-white">
                          Sold Out
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Info */}
                  <div className="flex flex-1 flex-col p-3">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product)}
                      className="text-left"
                    >
                      <h2 className="line-clamp-1 text-sm font-semibold text-slate-900 leading-snug hover:text-sky-600">
                        {product.name}
                      </h2>
                    </button>
                    {product.description && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
                        {product.description}
                      </p>
                    )}

                    {/* Price row */}
                    <div className="mt-auto pt-2 flex items-baseline justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-sky-600">
                          {formatMoney(product.priceCents, product.currency)}
                        </span>
                        {onSale && product.compareAtPriceCents && (
                          <span className="text-[10px] text-slate-300 line-through">
                            {formatMoney(product.compareAtPriceCents, product.currency)}
                          </span>
                        )}
                      </div>
                      {!outOfStock && (
                        <span className="text-[10px] text-slate-300">{product.stock} left</span>
                      )}
                    </div>

                    {/* Cart Button */}
                    <div className="mt-2.5">
                      {qty === 0 ? (
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => addItem(product)}
                          className="btn-press w-full rounded-xl bg-sky-500 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                        >
                          Add to Cart
                        </button>
                      ) : (
                        <div className="flex items-center justify-between gap-1 rounded-xl bg-sky-50 border border-sky-100 px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, qty - 1)}
                            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-sky-600 hover:bg-sky-100 transition-colors"
                            aria-label="Decrease"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[20px] text-center text-sm font-bold text-sky-700">
                            {qty}
                          </span>
                          <button
                            type="button"
                            disabled={qty >= product.stock}
                            onClick={() => updateQuantity(product.id, qty + 1)}
                            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-sky-600 hover:bg-sky-100 transition-colors disabled:opacity-30"
                            aria-label="Increase"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Infinite scroll sentinel + loading indicator */}
        {!loading && (
          <>
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
              <div className="mt-4 flex justify-center py-3">
                <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
              </div>
            )}
            {!hasMore && products.length > 0 && visibleProducts.length > 0 && (
              <p className="mt-4 text-center text-xs text-slate-300">All products loaded</p>
            )}
          </>
        )}
      </main>

      {/* Floating Cart Bar */}
      {totalCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pt-2">
          <div className="mx-auto max-w-2xl">
            <Link
              href="/checkout"
              className="btn-press flex w-full items-center justify-between rounded-2xl bg-sky-500 px-5 py-3.5 text-white shadow-xl shadow-sky-200 transition hover:bg-sky-600"
            >
              <span className="flex items-center gap-2.5 font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                  <ShoppingCart className="h-4 w-4" />
                </span>
                <span>{totalCount} item{totalCount !== 1 ? 's' : ''}</span>
              </span>
              <span className="text-base font-bold">{formatMoney(totalCents, currency)}</span>
            </Link>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (() => {
        const qty = getQty(selectedProduct.id);
        const outOfStock = selectedProduct.stock <= 0;
        const onSale =
          selectedProduct.compareAtPriceCents !== null &&
          selectedProduct.compareAtPriceCents > selectedProduct.priceCents;

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
            <div className="w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
              <div className="relative aspect-square max-h-72 w-full bg-slate-100">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-12 w-12 text-slate-300" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                {onSale && (
                  <span className="absolute left-3 top-3 rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white shadow">
                    SALE
                  </span>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {selectedProduct.category && (
                      <span className="mb-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {selectedProduct.category}
                      </span>
                    )}
                    <h2 className="text-lg font-bold text-slate-900">{selectedProduct.name}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-sky-600">
                      {formatMoney(selectedProduct.priceCents, selectedProduct.currency)}
                    </p>
                    {onSale && selectedProduct.compareAtPriceCents && (
                      <p className="text-xs text-slate-400 line-through">
                        {formatMoney(selectedProduct.compareAtPriceCents, selectedProduct.currency)}
                      </p>
                    )}
                  </div>
                </div>

                {selectedProduct.description && (
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                    {selectedProduct.description}
                  </p>
                )}

                <p className="mt-2 text-xs text-slate-400">
                  {outOfStock ? 'Currently out of stock' : `${selectedProduct.stock} in stock`}
                </p>

                <div className="mt-4">
                  {qty === 0 ? (
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addItem(selectedProduct)}
                      className="btn-press w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:bg-slate-100 disabled:text-slate-300"
                    >
                      {outOfStock ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(selectedProduct.id, qty - 1)}
                        className="rounded-lg p-2 text-sky-700 hover:bg-sky-100"
                        aria-label="Decrease"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-base font-bold text-sky-900">{qty} in cart</span>
                      <button
                        type="button"
                        disabled={qty >= selectedProduct.stock}
                        onClick={() => updateQuantity(selectedProduct.id, qty + 1)}
                        className="rounded-lg p-2 text-sky-700 hover:bg-sky-100 disabled:opacity-30"
                        aria-label="Increase"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
