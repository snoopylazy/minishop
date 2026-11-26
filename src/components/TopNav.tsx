'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, ShieldCheck, ShoppingBag } from 'lucide-react';
import { getTelegramAuthHeaders, initTelegramWebApp } from '@/lib/client-telegram';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  seller: 'Seller',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-violet-500 text-white',
  admin: 'bg-sky-500 text-white',
  seller: 'bg-emerald-500 text-white',
};

export function TopNav() {
  const [staffRole, setStaffRole] = useState<string | null>(null);

  useEffect(() => {
    initTelegramWebApp();
    fetch('/api/me', { headers: getTelegramAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.staffRole) {
          setStaffRole(data.staffRole);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm shadow-sky-200 group-hover:bg-sky-600 transition-colors">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <span className="font-bold text-slate-900 tracking-tight">Mini Shop</span>
        </Link>

        {/* Nav actions */}
        <nav className="flex items-center gap-2">
          <Link
            href="/orders"
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <Package className="h-3.5 w-3.5" />
            <span>My Orders</span>
          </Link>

          {staffRole && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${ROLE_COLORS[staffRole] ?? 'bg-slate-700 text-white'} shadow-sm`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{ROLE_LABELS[staffRole] ?? staffRole}</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
