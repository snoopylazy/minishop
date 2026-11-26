'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Store, Package, ShieldCheck } from 'lucide-react';
import { getTelegramAuthHeaders, initTelegramWebApp } from '@/lib/client-telegram';

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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <Store className="h-5 w-5 text-sky-600" />
          <span>Mini Shop</span>
        </Link>

        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link
            href="/orders"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100"
          >
            <Package className="h-4 w-4" />
            <span>Orders</span>
          </Link>

          {staffRole && (
            <Link
              href="/admin"
              className="flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-sky-700 hover:bg-sky-100"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="capitalize">{staffRole.replace('_', ' ')}</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
