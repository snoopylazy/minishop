'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, Package } from 'lucide-react';
import { useCart } from '@/components/CartContext';
import { useLang } from '@/components/LanguageContext';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';

export function CustomerBottomNav() {
  const pathname = usePathname();
  const { totalCount, totalCents, currency } = useCart();
  const { t, lang } = useLang();
  const [activeOrders, setActiveOrders] = useState(0);

  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    fetch('/api/badges', { headers: getTelegramAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setActiveOrders(data.activeCustomerOrders ?? 0);
      })
      .catch(() => {});
  }, [pathname]);

  if (pathname.startsWith('/admin')) return null;

  const tabs = [
    {
      href: '/',
      label: lang === 'km' ? 'ហាង' : 'Shop',
      icon: Home,
      active: pathname === '/',
    },
    {
      href: '/checkout',
      label: totalCount > 0 ? formatMoney(totalCents, currency) : lang === 'km' ? 'កន្ត្រក' : 'Cart',
      icon: ShoppingCart,
      active: pathname === '/checkout',
      badge: totalCount > 0 ? totalCount : undefined,
    },
    {
      href: '/orders',
      label: t('myOrders'),
      icon: Package,
      active: pathname === '/orders',
      dot: activeOrders > 0,
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-2xl items-center justify-around gap-1 px-3 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors ${
                tab.active
                  ? 'bg-sky-50 text-sky-600'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <div className="relative">
                <Icon className="h-4 w-4" />
                {tab.badge !== undefined && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-xs">
                    {tab.badge}
                  </span>
                )}
                {tab.dot && tab.badge === undefined && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-rose-500" />
                )}
              </div>
              <span className="truncate text-[10px] font-semibold leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
