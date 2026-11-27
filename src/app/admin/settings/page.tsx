'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { QrCode, Upload, Trash2, CheckCircle2, Loader2, Tag, Plus } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { getTelegramAuthHeaders, formatMoney } from '@/lib/client-telegram';
import { uploadDataUrlOrFallback } from '@/lib/upload-image';
import { useLang } from '@/components/LanguageContext';
import { useUI } from '@/components/UIContext';

interface PromoItem {
  id: number;
  code: string;
  discountType: string;
  discountValue: number;
  usedCount: number;
  maxUses: number | null;
  isActive: boolean;
}

function resizeQrToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const maxSide = 700;
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
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminSettingsPage() {
  const { t } = useLang();
  const { confirm, toast } = useUI();
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [deliveryFee, setDeliveryFee] = useState<string>('0');
  const [freeThreshold, setFreeThreshold] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoType, setPromoType] = useState<'percent' | 'fixed'>('percent');
  const [promoValue, setPromoValue] = useState('10');
  const [promoError, setPromoError] = useState<string | null>(null);

  const loadPromos = async () => {
    const res = await fetch('/api/promos', { headers: getTelegramAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setPromos(data.promos ?? []);
    }
  };

  useEffect(() => {
    loadPromos();
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        setQrImageUrl(data.paymentQrImageUrl ?? '');
        setPaymentNote(data.paymentNote ?? '');
        setDeliveryFee(
          typeof data.deliveryFeeCents === 'number' && data.deliveryFeeCents > 0
            ? (data.deliveryFeeCents / 100).toFixed(2)
            : '0',
        );
        setFreeThreshold(
          typeof data.freeDeliveryThresholdCents === 'number' && data.freeDeliveryThresholdCents > 0
            ? (data.freeDeliveryThresholdCents / 100).toFixed(2)
            : '',
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSaved(false);
    try {
      const dataUrl = await resizeQrToDataUrl(file);
      const { url, storedInR2 } = await uploadDataUrlOrFallback(dataUrl, 'qr');
      setQrImageUrl(url);
      toast(storedInR2 ? 'QR uploaded to Cloudflare R2!' : 'QR image ready', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not process QR image';
      setError(msg);
      toast(msg, 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({
          paymentQrImageUrl: qrImageUrl || null,
          paymentNote: paymentNote.trim() || null,
          deliveryFeeCents: Math.max(0, Math.round((Number(deliveryFee) || 0) * 100)),
          freeDeliveryThresholdCents:
            freeThreshold.trim() && Number(freeThreshold) > 0
              ? Math.round(Number(freeThreshold) * 100)
              : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Failed to save settings (Admin access required)');
      } else {
        setSaved(true);
      }
    } catch {
      setError('Network error while saving');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-xl px-4 py-5">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">{t('paymentQrTitle')}</h1>
          <p className="text-xs text-slate-500">
            {t('paymentQrSubtitle')}
          </p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-white border border-slate-100" />
        ) : (
          <form
            onSubmit={handleSave}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            {/* Preview */}
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6">
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="Shop Payment QR"
                  className="max-h-64 w-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center text-slate-400">
                  <QrCode className="h-12 w-12 text-slate-300" />
                  <p className="text-xs">{t('noQrYet')}</p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <label className="btn-press inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{qrImageUrl ? t('changeQrImage') : t('uploadQrImage')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrUpload}
                    className="hidden"
                  />
                </label>

                {qrImageUrl && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm('Remove the uploaded payment QR image?');
                      if (!ok) return;
                      setQrImageUrl('');
                      setSaved(false);
                      toast('QR removed — click Save to apply', 'info');
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('remove')}</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                {t('accountInfoLabel')}
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => {
                  setPaymentNote(e.target.value);
                  setSaved(false);
                }}
                placeholder="e.g. ABA: 000 123 456 (Shop Name)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('deliveryFeeDollar')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={deliveryFee}
                  onChange={(e) => {
                    setDeliveryFee(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('freeOverDollar')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={freeThreshold}
                  onChange={(e) => {
                    setFreeThreshold(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="e.g. 20.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-600">
                {error}
              </p>
            )}

            {saved && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{t('qrSavedMsg')}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn-press flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('savingLabel')}</span>
                </>
              ) : (
                <span>{t('savePaymentQr')}</span>
              )}
            </button>
          </form>
        )}

        {/* Promo / Coupon Codes */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-sky-500" />
            <h2 className="text-sm font-bold text-slate-900">
              {t('paymentQrTab') === 'QR បង់ប្រាក់' ? 'កូដបញ្ចុះតម្លៃ (Promo Codes)' : 'Promo / Coupon Codes'}{' '}
              <span className="text-rose-500">*</span>
            </h2>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPromoError(null);
              const valNum = Number(promoValue);
              const payloadValue = promoType === 'fixed' ? Math.round(valNum * 100) : Math.round(valNum);
              const res = await fetch('/api/promos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                body: JSON.stringify({
                  code: promoCodeInput,
                  discountType: promoType,
                  discountValue: payloadValue,
                }),
              });
              if (res.ok) {
                setPromoCodeInput('');
                await loadPromos();
              } else {
                const data = await res.json().catch(() => ({}));
                setPromoError(data.error ?? 'Failed to create promo code');
              }
            }}
            className="mb-4 flex flex-wrap items-end gap-2"
          >
            <div className="min-w-[120px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SAVE10"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono uppercase outline-none focus:border-sky-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Type</label>
              <select
                value={promoType}
                onChange={(e) => setPromoType(e.target.value as 'percent' | 'fixed')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs"
              >
                <option value="percent">% Off</option>
                <option value="fixed">$ Off</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Value <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step={promoType === 'fixed' ? '0.01' : '1'}
                min="1"
                required
                value={promoValue}
                onChange={(e) => setPromoValue(e.target.value)}
                className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs outline-none focus:border-sky-400 focus:bg-white"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-600"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('addBtn')}</span>
            </button>
          </form>

          {promoError && <p className="mb-3 text-xs text-rose-600">{promoError}</p>}

          {promos.length === 0 ? (
            <p className="text-xs text-slate-400">{t('noPromosYet')}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {promos.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-800">{p.code}</span>
                    <span className="ml-2 text-slate-500">
                      {p.discountType === 'percent' ? `${p.discountValue}% off` : `${formatMoney(p.discountValue, 'USD')} off`}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-400">({p.usedCount} used)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch(`/api/promos/${p.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', ...getTelegramAuthHeaders() },
                          body: JSON.stringify({ isActive: !p.isActive }),
                        });
                        if (res.ok) {
                          setPromos((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)),
                          );
                        }
                      }}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                        p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm(`Delete promo code ${p.code}?`);
                        if (!ok) return;
                        const res = await fetch(`/api/promos/${p.id}`, {
                          method: 'DELETE',
                          headers: getTelegramAuthHeaders(),
                        });
                        if (res.ok) {
                          setPromos((prev) => prev.filter((x) => x.id !== p.id));
                          toast(`Deleted ${p.code}`, 'success');
                        }
                      }}
                      className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
