'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { QrCode, Upload, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { getTelegramAuthHeaders } from '@/lib/client-telegram';

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
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [deliveryFee, setDeliveryFee] = useState<string>('0');
  const [freeThreshold, setFreeThreshold] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      setQrImageUrl(dataUrl);
    } catch {
      setError('Could not process QR image');
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
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Payment QR Code</h1>
            <p className="text-xs text-slate-500">
              Upload your real ABA / Bakong / ACLEDA QR image for customers to scan at checkout.
            </p>
          </div>
          <Link
            href="/admin"
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Orders
          </Link>
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
                  <p className="text-xs">No custom QR uploaded yet</p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <label className="btn-press inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{qrImageUrl ? 'Change QR Image' : 'Upload QR Image'}</span>
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
                    onClick={() => {
                      setQrImageUrl('');
                      setSaved(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Account Info / Instructions (optional)
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
                  Delivery Fee ($)
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
                  Free Over ($ optional)
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
                <span>Payment QR saved! Customers will see this QR at checkout.</span>
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
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save Payment QR</span>
              )}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
