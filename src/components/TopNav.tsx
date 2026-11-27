'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, ShieldCheck, ShoppingBag, Palette, X, RotateCcw } from 'lucide-react';
import { getTelegramAuthHeaders, initTelegramWebApp } from '@/lib/client-telegram';
import { useTheme, BG_PRESETS, ACCENT_PRESETS } from '@/components/ThemeContext';
import { useLang } from '@/components/LanguageContext';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-violet-500 text-white',
  admin: 'bg-sky-500 text-white',
  seller: 'bg-emerald-500 text-white',
};

let cachedStaffRole: string | null = null;

export function TopNav() {
  const [staffRole, setStaffRole] = useState<string | null>(cachedStaffRole);
  const [newOrders, setNewOrders] = useState(0);
  const [activeOrders, setActiveOrders] = useState(0);
  const [showTheme, setShowTheme] = useState(false);
  const { theme, setTheme, resetTheme } = useTheme();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    initTelegramWebApp();
    const headers = getTelegramAuthHeaders();
    fetch('/api/me', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.staffRole) {
          cachedStaffRole = data.staffRole;
          setStaffRole(data.staffRole);
        }
      })
      .catch(() => {});

    fetch('/api/badges', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setNewOrders(data.newOrders ?? 0);
          setActiveOrders(data.activeCustomerOrders ?? 0);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2 group">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm shadow-sky-200 group-hover:bg-sky-600 transition-colors">
              <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">Mini Shop</span>
          </Link>

          {/* Nav actions */}
          <nav className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'km' : 'en')}
              className="rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] sm:text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              title="Switch language"
            >
              {lang === 'en' ? 'ខ្មែរ' : 'EN'}
            </button>

            <button
              type="button"
              onClick={() => setShowTheme(true)}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              aria-label="Theme settings"
              title="Customize colors"
            >
              <Palette className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            <Link
              href="/orders"
              className="relative flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] sm:text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline sm:inline">{t('myOrders')}</span>
              {activeOrders > 0 && (
                <span className="h-2 w-2 rounded-full bg-rose-500" />
              )}
            </Link>

            {staffRole && (
              <Link
                href="/admin"
                className={`relative flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] sm:text-xs font-semibold transition-colors ${ROLE_COLORS[staffRole] ?? 'bg-slate-700 text-white'} shadow-sm`}
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>{staffRole === 'seller' ? t('seller') : t('dashboard')}</span>
                {newOrders > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {newOrders}
                  </span>
                )}
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Theme Customizer Modal */}
      {showTheme && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-sky-500" />
                <h2 className="text-sm font-bold text-slate-900">{t('customizeTheme')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowTheme(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Background Color */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('backgroundColor')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {BG_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setTheme({ ...theme, bgColor: preset.value })}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        theme.bgColor.toLowerCase() === preset.value
                          ? 'border-sky-500 ring-2 ring-sky-100 text-slate-900'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-slate-300"
                        style={{ backgroundColor: preset.value }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                  <label className="flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <span>{t('customColor')}</span>
                    <input
                      type="color"
                      value={theme.bgColor}
                      onChange={(e) => setTheme({ ...theme, bgColor: e.target.value })}
                      className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                </div>
              </div>

              {/* Accent Color */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('accentColor')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setTheme({ ...theme, accentColor: preset.value })}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        theme.accentColor.toLowerCase() === preset.value
                          ? 'border-sky-500 ring-2 ring-sky-100 text-slate-900'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: preset.value }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                  <label className="flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <span>{t('customColor')}</span>
                    <input
                      type="color"
                      value={theme.accentColor}
                      onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                      className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetTheme}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t('resetDefault')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTheme(false)}
                  className="btn-press rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                >
                  {t('done')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
