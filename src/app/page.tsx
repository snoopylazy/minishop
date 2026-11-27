'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Minus, Sparkles, Loader2, Package, Search, X } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { useCart, type CartProduct } from '@/components/CartContext';
import { formatMoney } from '@/lib/client-telegram';
import { parseProductVariants } from '@/lib/variants';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLang } from '@/components/LanguageContext';

interface Product extends CartProduct {
  description: string | null;
  category: string | null;
  variants: string | null;
  compareAtPriceCents: number | null;
}

function parseVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function StorefrontPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [managedCategories, setManagedCategories] = useState<Array<{ id: number; name: string; nameKm: string | null }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { items, addItem, updateQuantity } = useCart();
  const { t, lang } = useLang();

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

  useEffect(() => {
    fetchProducts(1, true);
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.categories) setManagedCategories(d.categories);
      })
      .catch(() => {});
  }, [fetchProducts]);

  // Reset to page 1 when category changes (client-side filter, no extra fetch needed)
  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) fetchProducts(page + 1, false);
  }, hasMore && !loadingMore);

  const managedNames = new Set(managedCategories.map((c) => c.name));
  const extraProductCats = Array.from(
    new Set(
      products
        .map((p) => p.category)
        .filter((c): c is string => typeof c === 'string' && c.length > 0 && !managedNames.has(c)),
    ),
  ).map((name) => ({ key: name, label: name }));

  const categories: Array<{ key: string; label: string }> = [
    { key: 'All', label: t('allCategories') },
    ...managedCategories.map((c) => ({
      key: c.name,
      label: lang === 'km' && c.nameKm ? c.nameKm : c.name,
    })),
    ...extraProductCats,
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

  const getQty = (id: number, variant: string | null = null) =>
    variant === null
      ? items.filter((i) => i.id === id).reduce((s, i) => s + i.quantity, 0)
      : (items.find((i) => i.id === id && (i.variant ?? null) === variant)?.quantity ?? 0);

  const openProductModal = (product: Product) => {
    const opts = parseProductVariants(product.variants, product.priceCents);
    setSelectedVariant(opts[0]?.name ?? null);
    setSelectedProduct(product);
  };

  return (
    <div className="min-h-screen pb-28">
      <TopNav />

      <main className="mx-auto max-w-2xl px-4 py-5">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('shopTitle')}</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {t('shopSubtitle')}
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {/* Category Tabs */}
        {categories.length > 1 && (
          <div className="mb-5 -mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  selectedCategory === cat.key
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-200'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-52 animate-pulse rounded-2xl bg-white border border-slate-100"
              />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-slate-100 p-5">
              <Sparkles className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">{t('noProducts')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
                    onClick={() => openProductModal(product)}
                    className="relative aspect-[4/3] w-full bg-slate-50 overflow-hidden text-left"
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
                        <span className="text-[10px] text-slate-300">{t('noImage')}</span>
                      </div>
                    )}

                    {/* SALE badge */}
                    {onSale && (
                      <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow">
                        {t('saleBadge')}
                      </span>
                    )}

                    {/* Sold Out overlay */}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                        <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-bold text-white">
                          {t('soldOut')}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Info */}
                  <div className="flex flex-1 flex-col p-2.5">
                    <button
                      type="button"
                      onClick={() => openProductModal(product)}
                      className="text-left"
                    >
                      <h2 className="line-clamp-1 text-[13px] font-semibold text-slate-900 leading-snug hover:text-sky-600">
                        {product.name}
                      </h2>
                    </button>
                    {(() => {
                      const cardVariants = parseProductVariants(product.variants, product.priceCents);
                      if (cardVariants.length === 0) return null;
                      return (
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-sky-600">
                          {cardVariants.length} {lang === 'km' ? 'ទំហំ' : cardVariants.length === 1 ? 'size' : 'sizes'} · {cardVariants.map((v) => v.name).slice(0, 4).join(' · ')}
                          {cardVariants.length > 4 ? '…' : ''}
                        </p>
                      );
                    })()}
                    {product.description && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400 leading-snug">
                        {product.description}
                      </p>
                    )}

                    {/* Price row */}
                    <div className="mt-auto pt-1.5 flex items-baseline justify-between">
                      <div className="flex flex-col">
                        {(() => {
                          const cardVariants = parseProductVariants(product.variants, product.priceCents);
                          const prices = cardVariants.length > 0 ? cardVariants.map((v) => v.priceCents) : [product.priceCents];
                          const minP = Math.min(...prices);
                          const maxP = Math.max(...prices);
                          return (
                            <span className="text-sm font-bold text-sky-600">
                              {minP === maxP
                                ? formatMoney(minP, product.currency)
                                : `${formatMoney(minP, product.currency)} - ${formatMoney(maxP, product.currency)}`}
                            </span>
                          );
                        })()}
                        {onSale && product.compareAtPriceCents && (
                          <span className="text-[10px] text-slate-300 line-through">
                            {formatMoney(product.compareAtPriceCents, product.currency)}
                          </span>
                        )}
                      </div>
                      {!outOfStock && (
                        <span className="text-[10px] text-slate-300">{product.stock} {t('left')}</span>
                      )}
                    </div>

                    {/* Cart Button */}
                    <div className="mt-2">
                      {parseProductVariants(product.variants, product.priceCents).length > 0 ? (
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => openProductModal(product)}
                          className="btn-press w-full rounded-xl bg-sky-500 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                        >
                          {outOfStock ? t('outOfStock') : qty > 0 ? `${t('addToCart')} (${qty})` : t('addToCart')}
                        </button>
                      ) : qty === 0 ? (
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => addItem(product)}
                          className="btn-press w-full rounded-xl bg-sky-500 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                        >
                          {outOfStock ? t('outOfStock') : t('addToCart')}
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
              <p className="mt-4 text-center text-xs text-slate-300">{t('allProductsLoaded')}</p>
            )}
          </>
        )}
      </main>

      {/* Product Detail Modal */}
      {selectedProduct && (() => {
        const variantOptions = parseProductVariants(selectedProduct.variants, selectedProduct.priceCents);
        const activeOption =
          variantOptions.length > 0
            ? (variantOptions.find((v) => v.name === selectedVariant) ?? variantOptions[0])
            : null;
        const activeVariant = activeOption?.name ?? null;
        const activePriceCents = activeOption?.priceCents ?? selectedProduct.priceCents;
        const hasDifferentPrices = new Set(variantOptions.map((v) => v.priceCents)).size > 1;
        const qty = getQty(selectedProduct.id, activeVariant);
        const outOfStock = selectedProduct.stock <= 0;
        const onSale =
          selectedProduct.compareAtPriceCents !== null &&
          selectedProduct.compareAtPriceCents > activePriceCents;

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
                      {formatMoney(activePriceCents, selectedProduct.currency)}
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
                  {outOfStock ? t('outOfStock') : `${selectedProduct.stock} ${t('inStock')}`}
                </p>

                {variantOptions.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">
                      {t('selectOption')} ({variantOptions.length} {lang === 'km' ? 'ទំហំ' : variantOptions.length === 1 ? 'size' : 'sizes'})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {variantOptions.map((opt) => {
                        const optQty = getQty(selectedProduct.id, opt.name);
                        return (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => setSelectedVariant(opt.name)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              activeVariant === opt.name
                                ? 'border-sky-500 bg-sky-50 text-sky-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {opt.name}
                            {hasDifferentPrices && (
                              <span className="ml-1 opacity-75">({formatMoney(opt.priceCents, selectedProduct.currency)})</span>
                            )}
                            {optQty > 0 && (
                              <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                                ×{optQty}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  {qty === 0 ? (
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addItem({ ...selectedProduct, priceCents: activePriceCents }, activeVariant)}
                      className="btn-press w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:bg-slate-100 disabled:text-slate-300"
                    >
                      {outOfStock ? t('outOfStock') : t('addToCart')}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(selectedProduct.id, qty - 1, activeVariant)}
                        className="rounded-lg p-2 text-sky-700 hover:bg-sky-100"
                        aria-label="Decrease"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-base font-bold text-sky-900">{qty} {t('inCart')}</span>
                      <button
                        type="button"
                        disabled={qty >= selectedProduct.stock}
                        onClick={() => updateQuantity(selectedProduct.id, qty + 1, activeVariant)}
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
