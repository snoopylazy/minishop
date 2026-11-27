'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, X } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { uploadDataUrlOrFallback } from '@/lib/upload-image';
import { parseProductVariants, serializeProductVariants } from '@/lib/variants';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLang } from '@/components/LanguageContext';
import { useUI } from '@/components/UIContext';

interface CategoryItem {
  id: number;
  name: string;
  nameKm: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  variants: string | null;
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
  const { t, lang } = useLang();
  const { confirm, toast } = useUI();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [showCatManager, setShowCatManager] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameKm, setNewCatNameKm] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatNameKm, setEditCatNameKm] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'active' | 'hidden' | 'low'>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [variantItems, setVariantItems] = useState<Array<{ name: string; price: string }>>([]);
  const [customVariant, setCustomVariant] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [stock, setStock] = useState('10');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadProducts = useCallback(async (pageNum = 1, replace = true) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
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
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const res = await fetch('/api/categories?all=1', {
      headers: getTelegramAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories ?? []);
    }
  }, []);

  useEffect(() => {
    loadProducts(1, true);
    loadCategories();
  }, [loadProducts, loadCategories]);

  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) loadProducts(page + 1, false);
  }, hasMore && !loadingMore);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCategory('');
    setVariantItems([]);
    setCustomVariant('');
    setDescription('');
    setPrice('');
    setCompareAtPrice('');
    setCurrency('USD');
    setStock('10');
    setImageUrl('');
    setError(null);
    setShowProductModal(false);
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

    const serializedVariants = serializeProductVariants(
      variantItems.map((v) => ({
        name: v.name,
        priceCents: toCents(v.price, currency),
      })),
    );

    const payload = {
      name,
      category: category.trim() || null,
      variants: serializedVariants,
      description: description.trim() || null,
      priceCents,
      compareAtPriceCents,
      currency,
      stock: Number(stock),
      imageUrl: imageUrl.trim() || null,
    };

    setSaving(true);
    try {
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
        toast(editingId ? t('saveChanges') : t('createProduct'), 'success');
        resetForm();
        await loadProducts();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to save product');
      }
    } finally {
      setSaving(false);
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
    const parsedVariants = parseProductVariants(product.variants, product.priceCents);
    setVariantItems(
      parsedVariants.map((v) => ({
        name: v.name,
        price: v.customPriceCents ? formatInput(v.customPriceCents) : '',
      })),
    );
    setCustomVariant('');
    setDescription(product.description ?? '');
    setCurrency(curr);
    setPrice(formatInput(product.priceCents));
    setCompareAtPrice(formatInput(product.compareAtPriceCents));
    setStock(String(product.stock));
    setImageUrl(product.imageUrl ?? '');
    setError(null);
    setShowProductModal(true);
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
    const ok = await confirm(`Delete "${product.name}"?`);
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/products/${product.id}`, {
      method: 'DELETE',
      headers: getTelegramAuthHeaders(),
    });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      toast('Product deleted', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? 'Could not delete product';
      setError(msg);
      toast(msg, 'error');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const { url, storedInR2 } = await uploadDataUrlOrFallback(dataUrl, 'products');
      setImageUrl(url);
      toast(storedInR2 ? 'Uploaded to Cloudflare R2!' : 'Image ready', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not process image file';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">{t('manageProducts')}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCatManager((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {lang === 'km' ? `គ្រប់គ្រងប្រភេទ (${categories.length})` : `Categories (${categories.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowProductModal(true);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('addNewProduct')}
            </button>
          </div>
        </div>

        {showCatManager && (
          <div className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">
              {lang === 'km' ? 'ប្រភេទទំនិញ' : 'Product Categories'}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  {lang === 'km' ? 'ឈ្មោះ (English)' : 'Name (English)'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={lang === 'km' ? 'ឧ. Drinks' : 'e.g. Drinks'}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  {lang === 'km' ? 'ឈ្មោះភាសាខ្មែរ (Optional)' : 'Khmer Name (optional)'}
                </label>
                <input
                  type="text"
                  placeholder={lang === 'km' ? 'ឧ. ភេសជ្ជៈ' : 'e.g. ភេសជ្ជៈ'}
                  value={newCatNameKm}
                  onChange={(e) => setNewCatNameKm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!newCatName.trim()) return;
                  const res = await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                    body: JSON.stringify({ name: newCatName.trim(), nameKm: newCatNameKm.trim() || null }),
                  });
                  if (res.ok) {
                    setNewCatName('');
                    setNewCatNameKm('');
                    toast(lang === 'km' ? 'បានបន្ថែមប្រភេទ!' : 'Category added!', 'success');
                    await loadCategories();
                  } else {
                    const err = await res.json().catch(() => ({}));
                    toast(err.error ?? 'Failed to add category', 'error');
                  }
                }}
                className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                {lang === 'km' ? '+ បន្ថែមប្រភេទ' : '+ Add Category'}
              </button>
            </div>
            {categories.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {categories.map((cat) => (
                  <div key={cat.id} className="px-3 py-2 text-xs">
                    {editingCatId === cat.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          placeholder={lang === 'km' ? 'ឈ្មោះ (English) *' : 'Name (English) *'}
                          className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                        <input
                          type="text"
                          value={editCatNameKm}
                          onChange={(e) => setEditCatNameKm(e.target.value)}
                          placeholder={lang === 'km' ? 'ឈ្មោះភាសាខ្មែរ' : 'Khmer name'}
                          className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!editCatName.trim()) return;
                            const res = await fetch(`/api/categories/${cat.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                              body: JSON.stringify({
                                name: editCatName.trim(),
                                nameKm: editCatNameKm.trim() || null,
                              }),
                            });
                            if (res.ok) {
                              setEditingCatId(null);
                              toast(lang === 'km' ? 'បានកែប្រែប្រភេទ!' : 'Category updated!', 'success');
                              await loadCategories();
                              await loadProducts(1, true);
                            } else {
                              const err = await res.json().catch(() => ({}));
                              toast(err.error ?? 'Failed to update category', 'error');
                            }
                          }}
                          className="rounded-lg bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-700"
                        >
                          {t('saveChanges')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatId(null)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          {t('cancelEdit')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-slate-900">{cat.name}</span>
                          {cat.nameKm && <span className="ml-2 text-slate-500">({cat.nameKm})</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatId(cat.id);
                              setEditCatName(cat.name);
                              setEditCatNameKm(cat.nameKm ?? '');
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {t('editBtn')}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetch(`/api/categories/${cat.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                                body: JSON.stringify({ isActive: !cat.isActive }),
                              });
                              if (res.ok) {
                                await loadCategories();
                              }
                            }}
                            className={`rounded-lg px-2 py-1 font-semibold ${
                              cat.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {cat.isActive ? t('activeBtn') : (lang === 'km' ? 'បានលាក់' : 'Hidden')}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirm(
                                lang === 'km'
                                  ? `លុបប្រភេទ "${cat.name}"?`
                                  : `Delete category "${cat.name}"?`,
                              );
                              if (!ok) return;
                              const res = await fetch(`/api/categories/${cat.id}`, {
                                method: 'DELETE',
                                headers: getTelegramAuthHeaders(),
                              });
                              if (res.ok) {
                                toast(lang === 'km' ? 'បានលុបប្រភេទ' : 'Category deleted', 'success');
                                await loadCategories();
                                await loadProducts(1, true);
                              }
                            }}
                            className="rounded-lg bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            {t('deleteLabel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showProductModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    {editingId ? t('editProduct') : t('addNewProduct')}
                  </h2>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                {t('productNamePlaceholder').replace(' *', '')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder={t('productNamePlaceholder').replace(' *', '')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                {t('categoryPlaceholder')} <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">{lang === 'km' ? '— ជ្រើសរើសប្រភេទ —' : '— Select Category —'}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {lang === 'km' && cat.nameKm ? `${cat.nameKm} (${cat.name})` : cat.name}
                  </option>
                ))}
                {category && !categories.some((c) => c.name === category) && (
                  <option value={category}>{category}</option>
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                {(currency === 'USD' ? t('priceUsdPlaceholder') : t('priceKhrPlaceholder')).replace(' *', '')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder={(currency === 'USD' ? t('priceUsdPlaceholder') : t('priceKhrPlaceholder')).replace(' *', '')}
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
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                {t('originalPricePlaceholder')}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={t('originalPricePlaceholder')}
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                {t('stockPlaceholder').replace(' *', '')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                placeholder={t('stockPlaceholder').replace(' *', '')}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                {t('imagePlaceholder')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={t('imagePlaceholder')}
                  value={imageUrl.startsWith('data:') ? 'Uploaded photo ready' : imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <label className="shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin text-sky-500" /> : t('uploadBtn')}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-600">
                {lang === 'km' ? 'ទំហំ / ជម្រើស និងតម្លៃ (ស្រេចចិត្ត)' : 'Sizes / Options & Prices (optional)'}
              </label>
              {variantItems.length > 0 && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                  {variantItems.length} {lang === 'km' ? 'ទំហំ' : 'selected'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size', 'Small', 'Medium', 'Large'].map((preset) => {
                const selected = variantItems.some((v) => v.name.toLowerCase() === preset.toLowerCase());
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setVariantItems((prev) =>
                        selected
                          ? prev.filter((v) => v.name.toLowerCase() !== preset.toLowerCase())
                          : [...prev, { name: preset, price: '' }],
                      );
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                      selected
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder={lang === 'km' ? 'បន្ថែមទំហំផ្សេងទៀត (ឧ. 40, Hot, Iced)' : 'Add custom size/option (e.g. 40, Hot, Iced)'}
                value={customVariant}
                onChange={(e) => setCustomVariant(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = customVariant.trim();
                    if (!trimmed || variantItems.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) return;
                    setVariantItems((prev) => [...prev, { name: trimmed, price: '' }]);
                    setCustomVariant('');
                  }
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = customVariant.trim();
                  if (!trimmed || variantItems.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) return;
                  setVariantItems((prev) => [...prev, { name: trimmed, price: '' }]);
                  setCustomVariant('');
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                + {t('addBtn')}
              </button>
            </div>

            {variantItems.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {variantItems.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 border border-slate-200">
                    <span className="min-w-[60px] text-xs font-bold text-slate-800">{item.name}</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={lang === 'km' ? `តម្លៃ (${currency}) — ទទេ=តម្លៃដើម` : `Price (${currency}) — empty=default`}
                      value={item.price}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariantItems((prev) =>
                          prev.map((v, i) => (i === idx ? { ...v, price: val } : v)),
                        );
                      }}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setVariantItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Remove size"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            type="text"
            placeholder={t('descPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          {error && <p className="text-xs text-rose-600">{error}</p>}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {t('cancelEdit')}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || uploadingPhoto}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingId ? t('saveChanges') : t('createProduct')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="mb-3 space-y-2">
          <input
            type="search"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['all', 'active', 'hidden', 'low'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setProductFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                  productFilter === f
                    ? 'bg-sky-500 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'all'
                  ? t('allCategories')
                  : f === 'active'
                    ? t('activeBtn')
                    : f === 'hidden'
                      ? (lang === 'km' ? 'បានលាក់' : 'Hidden')
                      : (lang === 'km' ? 'ស្តុកតិច' : 'Low Stock')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))}
          </div>
        ) : (
        <div className="space-y-2.5">
          {products
            .filter((p) => {
              if (productFilter === 'active' && !p.isActive) return false;
              if (productFilter === 'hidden' && p.isActive) return false;
              if (productFilter === 'low' && p.stock > 5) return false;
              if (!productSearch.trim()) return true;
              const q = productSearch.trim().toLowerCase();
              return (
                p.name.toLowerCase().includes(q) ||
                (p.category ?? '').toLowerCase().includes(q)
              );
            })
            .map((product) => (
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
        )}

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
