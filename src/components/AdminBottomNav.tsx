'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingBag, Package, BarChart3, QrCode, Users, ClipboardList } from 'lucide-react';
import { getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useLang } from '@/components/LanguageContext';

let cachedAdminRole: string | null = null;

export function AdminBottomNav() {
  const pathname = usePathname();
  const { t, lang } = useLang();
  const [role, setRole] = useState<string | null>(cachedAdminRole);
  const [newOrders, setNewOrders] = useState(0);
  const [lowStock, setLowStock] = useState(0);

  useEffect(() => {
    const headers = getTelegramAuthHeaders();
    fetch('/api/me', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.staffRole) {
          cachedAdminRole = data.staffRole;
          setRole(data.staffRole);
        }
      })
      .catch(() => {});

    fetch('/api/badges', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setNewOrders(data.newOrders ?? 0);
          setLowStock(data.lowStock ?? 0);
        }
      })
      .catch(() => {});
  }, [pathname]);

  if (!role) return null;

  const tabs = [
    {
      href: '/',
      label: lang === 'km' ? 'ហាង' : 'Store',
      icon: Home,
      show: true,
    },
    {
      href: '/admin',
      label: t('ordersTab'),
      icon: ShoppingBag,
      show: true,
      badge: newOrders > 0 ? newOrders : undefined,
    },
    {
      href: '/admin/products',
      label: t('productsTab'),
      icon: Package,
      show: role === 'super_admin' || role === 'admin',
      dot: lowStock > 0,
    },
    {
      href: '/admin/reports',
      label: lang === 'km' ? 'របាយការណ៍' : 'Reports',
      icon: BarChart3,
      show: role === 'super_admin' || role === 'admin',
    },
    {
      href: '/admin/settings',
      label: 'QR',
      icon: QrCode,
      show: role === 'super_admin' || role === 'admin',
    },
    {
      href: '/admin/staff',
      label: lang === 'km' ? 'បុគ្គលិក' : 'Staff',
      icon: Users,
      show: role === 'super_admin',
    },
    {
      href: '/admin/audit',
      label: lang === 'km' ? 'កំណត់ត្រា' : 'Audit',
      icon: ClipboardList,
      show: role === 'super_admin',
    },
  ].filter((tab) => tab.show);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-0.5 overflow-x-auto scrollbar-hide px-2 py-1.5">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-[48px] flex-1 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 transition-colors ${
                active
                  ? 'bg-sky-50 text-sky-600'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <div className="relative">
                <Icon className="h-4 w-4 shrink-0" />
                {tab.badge !== undefined && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
                {tab.dot && tab.badge === undefined && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-rose-500" />
                )}
              </div>
              <span className="whitespace-nowrap text-[10px] font-semibold leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
