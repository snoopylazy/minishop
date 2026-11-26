'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, Loader2, ShieldAlert } from 'lucide-react';
import { getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useLang } from '@/components/LanguageContext';

export function AdminPinGate({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const [status, setStatus] = useState<'checking' | 'locked' | 'unlocked' | 'denied'>('checking');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('miniapp_admin_unlocked') === '1') {
        setStatus('unlocked');
        return;
      }
    } catch {
      // Ignore storage error
    }

    fetch('/api/admin/verify-pin', { headers: getTelegramAuthHeaders() })
      .then(async (res) => {
        if (res.status === 403 || res.status === 401) {
          setStatus('denied');
          return;
        }
        const data = (await res.json()) as { pinRequired?: boolean };
        if (data.pinRequired) {
          setStatus('locked');
        } else {
          setStatus('unlocked');
        }
      })
      .catch(() => setStatus('unlocked'));
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        try {
          sessionStorage.setItem('miniapp_admin_unlocked', '1');
        } catch {
          // Ignore storage error
        }
        setStatus('unlocked');
      } else {
        setError(lang === 'km' ? 'លេខកូដ PIN មិនត្រឹមត្រូវទេ' : 'Incorrect PIN');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="mx-auto mt-12 max-w-sm px-4">
        <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-rose-500" />
          <p className="text-sm font-semibold text-rose-700">
            {lang === 'km' ? 'គ្មានសិទ្ធិចូលប្រើប្រាស់ទេ' : 'Staff access required'}
          </p>
          <Link href="/" className="mt-3 inline-block text-xs font-semibold text-sky-600">
            {lang === 'km' ? '← ត្រឡប់ទៅហាង' : '← Back to shop'}
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div className="mx-auto mt-12 max-w-xs px-4">
        <form
          onSubmit={handleUnlock}
          className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-base font-bold text-slate-900">
            {lang === 'km' ? 'បញ្ចូលលេខកូដ PIN បុគ្គលិក' : 'Enter Staff PIN'}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {lang === 'km'
              ? 'ដើម្បីការពារសុវត្ថិភាពផ្ទាំងគ្រប់គ្រង'
              : 'Required to unlock the staff dashboard'}
          </p>

          <input
            type="password"
            inputMode="numeric"
            autoFocus
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-lg font-bold tracking-[0.4em] outline-none focus:border-sky-400 focus:bg-white"
          />

          {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-press mt-4 w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {submitting
              ? lang === 'km'
                ? 'កំពុងពិនិត្យ…'
                : 'Checking…'
              : lang === 'km'
                ? 'ដោះសោ'
                : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
