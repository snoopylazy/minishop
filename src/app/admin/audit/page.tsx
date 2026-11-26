'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, ClipboardList, Search } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLang } from '@/components/LanguageContext';

interface AuditLogEntry {
  id: number;
  actorTelegramId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

const TARGET_BADGE: Record<string, string> = {
  order: 'bg-sky-50 text-sky-700 border-sky-200',
  product: 'bg-violet-50 text-violet-700 border-violet-200',
  staff: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  settings: 'bg-amber-50 text-amber-700 border-amber-200',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAuditPage() {
  const { t } = useLang();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadLogs = useCallback(async (pageNum: number, replace: boolean, typeFilter: string) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/audit-logs?page=${pageNum}&limit=20&targetType=${encodeURIComponent(typeFilter)}`,
        { headers: getTelegramAuthHeaders() },
      );
      if (res.ok) {
        const data = await res.json();
        setLogs((prev) => (replace ? (data.logs ?? []) : [...prev, ...(data.logs ?? [])]));
        setHasMore(data.hasMore ?? false);
        setPage(pageNum);
      } else {
        setError('Super Admin access required.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(1, true, filterType);
  }, [filterType, loadLogs]);

  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) loadLogs(page + 1, false, filterType);
  }, hasMore && !loadingMore);

  const visibleLogs = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      log.actorName.toLowerCase().includes(q) ||
      log.actorTelegramId.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.details ?? '').toLowerCase().includes(q) ||
      (log.targetId ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('auditLogTitle')}</h1>
            <p className="text-xs text-slate-500">
              {t('auditLogSubtitle')}
            </p>
          </div>
          <Link
            href="/admin"
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('backToOrders')}
          </Link>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center text-sm text-rose-700">
            {error}
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchAuditPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {(['all', 'order', 'product', 'staff', 'settings'] as const).map((typeKey) => (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => setFilterType(typeKey)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                      filterType === typeKey
                        ? 'bg-sky-500 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {typeKey === 'all' ? t('allActivity') : typeKey}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-20 animate-pulse rounded-2xl bg-white border border-slate-100" />
                ))}
              </div>
            ) : visibleLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                <ClipboardList className="h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">{t('noActivityYet')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${TARGET_BADGE[log.targetType] ?? TARGET_BADGE['order']}`}
                        >
                          {log.targetType}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {log.action}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>

                    {log.details && (
                      <p className="mt-1.5 text-sm text-slate-800">{log.details}</p>
                    )}

                    <p className="mt-1 text-[11px] text-slate-400">
                      By <span className="font-semibold text-slate-600">{log.actorName}</span>{' '}
                      <span className="capitalize">({log.actorRole.replace('_', ' ')})</span> • ID:{' '}
                      <span className="font-mono">{log.actorTelegramId}</span>
                    </p>
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
            {!hasMore && logs.length > 0 && (
              <p className="mt-4 text-center text-xs text-slate-400">{t('allActivityLoaded')}</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
