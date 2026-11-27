'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Download, Send, AlertTriangle, TrendingUp, Users, Loader2, CheckCircle2 } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { formatMoney, getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useLang } from '@/components/LanguageContext';

interface ReportData {
  summary: {
    totalOrders: number;
    paidOrders: number;
    unpaidOrders: number;
    paidRevenueUsdCents: number;
    paidRevenueKhr: number;
  };
  byStatus: {
    new: number;
    preparing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  chart: {
    year: number;
    availableYears: number[];
    months: Array<{
      month: number;
      label: string;
      usdCents: number;
      khr: number;
      orders: number;
    }>;
  };
  topProducts: Array<{ name: string; qty: number; revenueCents: number; currency: string }>;
  topCustomers: Array<{ name: string; telegramId: string; orders: number; spentUsdCents: number; spentKhr: number }>;
  lowStockProducts: Array<{ id: number; name: string; stock: number }>;
  table: {
    rows: Array<{
      id: number;
      orderCode: string;
      createdAt: string;
      customerName: string;
      phone: string;
      itemsSummary: string;
      totalCents: number;
      currency: string;
      paymentStatus: string;
      orderStatus: string;
    }>;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  csvContent: string;
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const { lang } = useLang();
  const [preset, setPreset] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('30d');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toIsoDate(d);
  });
  const [toDate, setToDate] = useState(() => toIsoDate(new Date()));
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => new Date().getMonth() + 1);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingTg, setSendingTg] = useState(false);
  const [sentTg, setSentTg] = useState(false);

  const loadReport = useCallback(async (from: string, to: string, pageNum: number, pageLimit: number, yearNum: number, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      qs.set('page', String(pageNum));
      qs.set('limit', String(pageLimit));
      qs.set('year', String(yearNum));
      if (status && status !== 'all') qs.set('status', status);
      const res = await fetch(`/api/reports?${qs.toString()}`, {
        headers: getTelegramAuthHeaders(),
      });
      if (!res.ok) {
        setError(lang === 'km' ? 'ត្រូវការសិទ្ធិ Admin ឬ Super Admin' : 'Admin or Super Admin access required.');
        return;
      }
      const data = (await res.json()) as ReportData;
      setReport(data);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadReport(fromDate, toDate, page, limit, chartYear, statusFilter);
  }, [fromDate, toDate, page, limit, chartYear, statusFilter, loadReport]);

  const applyPreset = (p: 'today' | '7d' | '30d' | 'all') => {
    setPreset(p);
    setPage(1);
    const now = new Date();
    const today = toIsoDate(now);
    if (p === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (p === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setFromDate(toIsoDate(d));
      setToDate(today);
    } else if (p === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      setFromDate(toIsoDate(d));
      setToDate(today);
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const handleDownloadCsv = async () => {
    const qs = new URLSearchParams();
    if (fromDate) qs.set('from', fromDate);
    if (toDate) qs.set('to', toDate);
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    qs.set('export', '1');
    const res = await fetch(`/api/reports?${qs.toString()}`, {
      headers: getTelegramAuthHeaders(),
    });
    if (!res.ok) return;
    const csvText = await res.text();
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${fromDate || 'all'}-to-${toDate || 'now'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToTelegram = async () => {
    setSendingTg(true);
    setSentTg(false);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({ from: fromDate || undefined, to: toDate || undefined, status: statusFilter }),
      });
      if (res.ok) setSentTg(true);
    } finally {
      setSendingTg(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-5">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">
            {lang === 'km' ? 'របាយការណ៍លក់' : 'Sales Reports'}
          </h1>
          <p className="text-xs text-slate-500">
            {lang === 'km' ? 'តាមដានចំណូល ទំនិញលក់ដាច់ និងទាញយក Excel (.csv)' : 'Track revenue, best sellers, low stock, and export Excel (.csv)'}
          </p>
        </div>

        {/* Date Presets + Custom Dates */}
        <div className="mb-4 space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['today', lang === 'km' ? 'ថ្ងៃនេះ' : 'Today'],
                ['7d', lang === 'km' ? '7 ថ្ងៃ' : '7 Days'],
                ['30d', lang === 'km' ? '30 ថ្ងៃ' : '30 Days'],
                ['all', lang === 'km' ? 'ទាំងអស់' : 'All Time'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  preset === key
                    ? 'bg-sky-500 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPreset('custom');
                setPage(1);
                setFromDate(e.target.value);
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPreset('custom');
                setPage(1);
                setToDate(e.target.value);
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              aria-label="Filter by status"
            >
              <option value="all">{lang === 'km' ? 'ស្ថានភាពទាំងអស់' : 'All Status'}</option>
              <option value="paid">{lang === 'km' ? 'បានបង់' : 'Paid'}</option>
              <option value="unpaid">{lang === 'km' ? 'មិនទាន់បង់' : 'Unpaid'}</option>
              <option value="new">{lang === 'km' ? 'ថ្មី' : 'New'}</option>
              <option value="preparing">{lang === 'km' ? 'កំពុងរៀបចំ' : 'Preparing'}</option>
              <option value="shipped">{lang === 'km' ? 'កំពុងដឹក' : 'Shipped'}</option>
              <option value="delivered">{lang === 'km' ? 'បានដឹកជូន' : 'Delivered'}</option>
              <option value="cancelled">{lang === 'km' ? 'បានបោះបង់' : 'Cancelled'}</option>
            </select>
          </div>

          {report && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{lang === 'km' ? 'ទាញយក Excel (.csv)' : 'Export Excel (.csv)'}</span>
              </button>
              <button
                type="button"
                disabled={sendingTg}
                onClick={handleSendToTelegram}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {sendingTg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{lang === 'km' ? 'ផ្ញើទៅ Telegram' : 'Send to Telegram'}</span>
              </button>
            </div>
          )}

          {sentTg && (
            <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{lang === 'km' ? 'បានផ្ញើឯកសារ .csv ទៅ Telegram របស់អ្នក!' : 'Sent .csv report to your Telegram chat!'}</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-24 animate-pulse rounded-2xl bg-white border border-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center text-sm text-rose-700">
            {error}
          </div>
        ) : report ? (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {/* Summary Cards */}
            <div className="md:col-span-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">
                  {lang === 'km' ? 'ចំណូលបានបង់ (USD)' : 'Paid Revenue (USD)'}
                </p>
                <p className="mt-0.5 text-lg font-bold text-emerald-600">
                  {formatMoney(report.summary.paidRevenueUsdCents, 'USD')}
                </p>
                {report.summary.paidRevenueKhr > 0 && (
                  <p className="text-xs font-semibold text-emerald-700">
                    + {formatMoney(report.summary.paidRevenueKhr, 'KHR')}
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">
                  {lang === 'km' ? 'បង់រួច / សរុប' : 'Paid / Total Orders'}
                </p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">
                  {report.summary.paidOrders} <span className="text-sm font-normal text-slate-400">/ {report.summary.totalOrders}</span>
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">
                  {lang === 'km' ? 'មិនទាន់បង់' : 'Unpaid Orders'}
                </p>
                <p className="mt-0.5 text-lg font-bold text-amber-600">{report.summary.unpaidOrders}</p>
              </div>
            </div>

            {/* Monthly Income Chart by Year */}
            {(() => {
              const maxUsd = Math.max(1, ...report.chart.months.map((m) => m.usdCents));
              const yearTotalUsd = report.chart.months.reduce((s, m) => s + m.usdCents, 0);
              const yearTotalKhr = report.chart.months.reduce((s, m) => s + m.khr, 0);
              const activeMonthData = report.chart.months.find((m) => m.month === selectedMonth);

              return (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {lang === 'km' ? `ចំណូលប្រចាំខែ (${report.chart.year})` : `Monthly Income (${report.chart.year})`}
                      </h2>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {formatMoney(yearTotalUsd, 'USD')}
                        {yearTotalKhr > 0 ? ` + ${formatMoney(yearTotalKhr, 'KHR')}` : ''}
                      </p>
                    </div>
                    <select
                      value={chartYear}
                      onChange={(e) => setChartYear(Number(e.target.value))}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {report.chart.availableYears.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeMonthData && (
                    <div className="mb-3 flex items-center justify-between rounded-xl bg-sky-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-sky-900">
                        {activeMonthData.label} {report.chart.year} ({activeMonthData.orders}{' '}
                        {lang === 'km' ? 'ការបញ្ជាទិញ' : 'paid orders'})
                      </span>
                      <span className="font-bold text-sky-600">
                        {formatMoney(activeMonthData.usdCents, 'USD')}
                        {activeMonthData.khr > 0 ? ` + ${formatMoney(activeMonthData.khr, 'KHR')}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex h-36 items-end justify-between gap-1.5 pt-2">
                    {report.chart.months.map((m) => {
                      const pct = m.usdCents > 0 ? Math.max(8, Math.round((m.usdCents / maxUsd) * 100)) : 3;
                      const isSelected = selectedMonth === m.month;
                      return (
                        <button
                          key={m.month}
                          type="button"
                          onClick={() => setSelectedMonth(m.month)}
                          className="group flex flex-1 flex-col items-center gap-1.5 h-full justify-end"
                        >
                          <div className="flex w-full flex-1 items-end justify-center">
                            <div
                              style={{ height: `${pct}%` }}
                              className={`w-full max-w-[22px] rounded-t-md transition-all ${
                                m.usdCents === 0 && m.khr === 0
                                  ? 'bg-slate-100'
                                  : isSelected
                                    ? 'bg-sky-600'
                                    : 'bg-sky-400 group-hover:bg-sky-500'
                              }`}
                            />
                          </div>
                          <span
                            className={`text-[10px] font-semibold ${
                              isSelected ? 'text-sky-600' : 'text-slate-400'
                            }`}
                          >
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Order Status Breakdown */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                {lang === 'km' ? 'ស្ថានភាពការបញ្ជាទិញ' : 'Orders by Status'}
              </h2>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {(
                  [
                    ['new', lang === 'km' ? 'ថ្មី' : 'New', 'bg-sky-50 text-sky-700'],
                    ['preparing', lang === 'km' ? 'រៀបចំ' : 'Prep', 'bg-violet-50 text-violet-700'],
                    ['shipped', lang === 'km' ? 'ដឹក' : 'Ship', 'bg-blue-50 text-blue-700'],
                    ['delivered', lang === 'km' ? 'ដល់' : 'Done', 'bg-emerald-50 text-emerald-700'],
                    ['cancelled', lang === 'km' ? 'បោះបង់' : 'Cancel', 'bg-slate-100 text-slate-600'],
                  ] as const
                ).map(([key, label, cls]) => (
                  <div key={key} className={`rounded-xl p-2 ${cls}`}>
                    <p className="text-base font-bold">{report.byStatus[key]}</p>
                    <p className="text-[10px] font-semibold">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Selling Products */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2.5 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-sky-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'km' ? 'ទំនិញលក់ដាច់បំផុត (Top 5)' : 'Top Selling Products'}
                </h2>
              </div>
              {report.topProducts.length === 0 ? (
                <p className="text-xs text-slate-400">{lang === 'km' ? 'មិនទាន់មានការលក់ទេ' : 'No paid sales in this period.'}</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {report.topProducts.map((p, idx) => (
                    <div key={`${p.name}-${idx}`} className="flex items-center justify-between py-2 text-xs">
                      <span className="font-medium text-slate-800">
                        {idx + 1}. {p.name} <span className="text-slate-400">({p.qty} sold)</span>
                      </span>
                      <span className="font-bold text-slate-900">{formatMoney(p.revenueCents, p.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Low Stock Alerts */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2.5 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'km' ? 'ទំនិញជិតអស់ស្តុក (≤ 5)' : 'Low Stock Alerts (≤ 5)'}
                </h2>
              </div>
              {report.lowStockProducts.length === 0 ? (
                <p className="text-xs text-slate-400">{lang === 'km' ? 'ស្តុកទំនិញទាំងអស់គ្រប់គ្រាន់' : 'All products have plenty of stock.'}</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {report.lowStockProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.stock === 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
                        {p.stock} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Customers */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2.5 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'km' ? 'អតិថិជនទិញច្រើនជាងគេ' : 'Top Customers'}
                </h2>
              </div>
              {report.topCustomers.length === 0 ? (
                <p className="text-xs text-slate-400">{lang === 'km' ? 'មិនទាន់មានទិន្នន័យទេ' : 'No paid customer orders in this period.'}</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {report.topCustomers.map((c, idx) => (
                    <div key={c.telegramId} className="flex items-center justify-between py-2 text-xs">
                      <span className="font-medium text-slate-800">
                        {idx + 1}. {c.name} <span className="text-slate-400">({c.orders} orders)</span>
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatMoney(c.spentUsdCents, 'USD')}
                        {c.spentKhr > 0 ? ` + ${formatMoney(c.spentKhr, 'KHR')}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Paginated Orders Table */}
            <div className="md:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'km' ? 'តារាងការបញ្ជាទិញទាំងអស់' : 'All Orders Table'} ({report.table.total})
                </h2>
                <div className="flex items-center gap-2">
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
                    aria-label="Rows per page"
                  >
                    <option value={10}>10 / {lang === 'km' ? 'ទំព័រ' : 'page'}</option>
                    <option value={20}>20 / {lang === 'km' ? 'ទំព័រ' : 'page'}</option>
                    <option value={50}>50 / {lang === 'km' ? 'ទំព័រ' : 'page'}</option>
                    <option value={100}>100 / {lang === 'km' ? 'ទំព័រ' : 'page'}</option>
                  </select>
                  <span className="text-[11px] text-slate-400">
                    {lang === 'km' ? `${report.table.page} / ${report.table.totalPages}` : `Page ${report.table.page} of ${report.table.totalPages}`}
                  </span>
                </div>
              </div>

              {report.table.rows.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400">
                  {lang === 'km' ? 'មិនមានទិន្នន័យក្នុងកំឡុងពេលនេះទេ' : 'No orders in this date range.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'កូដ' : 'Order'}</th>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'អតិថិជន' : 'Customer'}</th>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'ទំនិញ' : 'Items'}</th>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'សរុប' : 'Total'}</th>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'បង់ប្រាក់' : 'Pay'}</th>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'ស្ថានភាព' : 'Status'}</th>
                        <th className="px-3 py-2.5">{lang === 'km' ? 'កាលបរិច្ឆេទ' : 'Date'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.table.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">{row.orderCode}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-800">{row.customerName}</p>
                            <p className="text-[10px] text-slate-400">{row.phone}</p>
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-600" title={row.itemsSummary}>
                            {row.itemsSummary}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-900">
                            {formatMoney(row.totalCents, row.currency)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                                row.paymentStatus === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {row.paymentStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 capitalize text-slate-600">{row.orderStatus}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-400">
                            {new Date(row.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.table.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {lang === 'km' ? '← មុន' : '← Prev'}
                  </button>
                  <span className="text-xs text-slate-500">
                    {page} / {report.table.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= report.table.totalPages}
                    onClick={() => setPage((p) => Math.min(report.table.totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {lang === 'km' ? 'បន្ទាប់ →' : 'Next →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
