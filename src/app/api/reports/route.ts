import { NextResponse } from 'next/server';
import { InputFile } from 'grammy';
import { db } from '@/prisma/db';
import { getAuthContext, hasRole } from '@/lib/telegram-auth';
import { getBot } from '@/lib/bot';
import { formatMoney } from '@/lib/payment';

function parseDateBounds(fromParam: string | null, toParam: string | null) {
  const fromDate = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : null;
  const toDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : null;
  return {
    fromTime: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.getTime() : null,
    toTime: toDate && !Number.isNaN(toDate.getTime()) ? toDate.getTime() : null,
  };
}

function escapeCsv(val: string | number | null | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function buildReportData(
  fromParam: string | null,
  toParam: string | null,
  includeCsv = false,
  page = 1,
  limit = 20,
  yearParam: number | null = null,
  statusParam: string | null = null,
) {
  const { fromTime, toTime } = parseDateBounds(fromParam, toParam);

  const [allOrders, allProducts] = await Promise.all([
    db.orm.public.Order.include('items').orderBy((o) => o.createdAt.desc()).all(),
    db.orm.public.Product.where({ isActive: true }).orderBy((p) => p.stock.asc()).all(),
  ]);

  const orders = allOrders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    if (fromTime !== null && t < fromTime) return false;
    if (toTime !== null && t > toTime) return false;
    if (statusParam && statusParam !== 'all') {
      if (statusParam === 'paid' && o.paymentStatus !== 'paid') return false;
      if (statusParam === 'unpaid' && o.paymentStatus === 'paid') return false;
      if (
        statusParam !== 'paid' &&
        statusParam !== 'unpaid' &&
        o.orderStatus !== statusParam
      ) {
        return false;
      }
    }
    return true;
  });

  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
  const paidRevenueUsdCents = paidOrders
    .filter((o) => o.currency === 'USD')
    .reduce((sum, o) => sum + o.totalCents, 0);
  const paidRevenueKhr = paidOrders
    .filter((o) => o.currency === 'KHR')
    .reduce((sum, o) => sum + o.totalCents, 0);

  const byStatus = {
    new: orders.filter((o) => o.orderStatus === 'new').length,
    preparing: orders.filter((o) => o.orderStatus === 'preparing').length,
    shipped: orders.filter((o) => o.orderStatus === 'shipped').length,
    delivered: orders.filter((o) => o.orderStatus === 'delivered').length,
    cancelled: orders.filter((o) => o.orderStatus === 'cancelled').length,
  };

  const productMap = new Map<string, { name: string; qty: number; revenueCents: number; currency: string }>();
  const customerMap = new Map<string, { name: string; telegramId: string; orders: number; spentUsdCents: number; spentKhr: number }>();

  for (const o of paidOrders) {
    for (const item of o.items) {
      const key = `${item.productId}:${o.currency}`;
      const cur = productMap.get(key) ?? { name: item.productName, qty: 0, revenueCents: 0, currency: o.currency };
      cur.qty += item.quantity;
      cur.revenueCents += item.unitPriceCents * item.quantity;
      productMap.set(key, cur);
    }

    const cust = customerMap.get(o.customerTelegramId) ?? {
      name: o.customerName,
      telegramId: o.customerTelegramId,
      orders: 0,
      spentUsdCents: 0,
      spentKhr: 0,
    };
    cust.orders += 1;
    if (o.currency === 'KHR') cust.spentKhr += o.totalCents;
    else cust.spentUsdCents += o.totalCents;
    customerMap.set(o.customerTelegramId, cust);
  }

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.spentUsdCents - a.spentUsdCents || b.orders - a.orders)
    .slice(0, 5);

  const lowStockProducts = allProducts
    .filter((p) => p.stock <= 5)
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock }));

  let csvContent: string | undefined;
  if (includeCsv) {
    const csvHeader = [
      'Order Code',
      'Date',
      'Customer',
      'Phone',
      'Address',
      'Items',
      'Total',
      'Currency',
      'Payment Status',
      'Order Status',
    ].join(',');

    const csvLines = orders.map((o) => {
      const itemsStr = o.items.map((i) => `${i.productName} x${i.quantity}`).join('; ');
      const amountStr = o.currency === 'KHR' ? String(o.totalCents) : (o.totalCents / 100).toFixed(2);
      return [
        escapeCsv(o.orderCode),
        escapeCsv(new Date(o.createdAt).toISOString().slice(0, 16).replace('T', ' ')),
        escapeCsv(o.customerName),
        escapeCsv(o.phone),
        escapeCsv(o.address),
        escapeCsv(itemsStr),
        escapeCsv(amountStr),
        escapeCsv(o.currency),
        escapeCsv(o.paymentStatus),
        escapeCsv(o.orderStatus),
      ].join(',');
    });

    // UTF-8 BOM so Khmer characters open cleanly in Microsoft Excel
    csvContent = `\uFEFF${[csvHeader, ...csvLines].join('\n')}`;
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  const tableRows = orders.slice(offset, offset + safeLimit).map((o) => ({
    id: o.id,
    orderCode: o.orderCode,
    createdAt: o.createdAt,
    customerName: o.customerName,
    phone: o.phone,
    itemsSummary: o.items.map((i) => `${i.productName} ×${i.quantity}`).join(', '),
    totalCents: o.totalCents,
    currency: o.currency,
    paymentStatus: o.paymentStatus,
    orderStatus: o.orderStatus,
  }));

  const currentYear = new Date().getFullYear();
  const selectedYear = yearParam && yearParam >= 2000 && yearParam <= 2100 ? yearParam : currentYear;
  const yearSet = new Set<number>([currentYear, selectedYear]);
  for (const o of allOrders) {
    yearSet.add(new Date(o.createdAt).getFullYear());
  }
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyChart = MONTH_LABELS.map((label, idx) => ({
    month: idx + 1,
    label,
    usdCents: 0,
    khr: 0,
    orders: 0,
  }));

  for (const o of allOrders) {
    if (o.paymentStatus !== 'paid') continue;
    const d = new Date(o.createdAt);
    if (d.getFullYear() !== selectedYear) continue;
    const bucket = monthlyChart[d.getMonth()];
    if (!bucket) continue;
    bucket.orders += 1;
    if (o.currency === 'KHR') bucket.khr += o.totalCents;
    else bucket.usdCents += o.totalCents;
  }

  return {
    summary: {
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
      unpaidOrders: orders.filter((o) => o.paymentStatus !== 'paid').length,
      paidRevenueUsdCents,
      paidRevenueKhr,
    },
    chart: {
      year: selectedYear,
      availableYears,
      months: monthlyChart,
    },
    byStatus,
    topProducts,
    topCustomers,
    lowStockProducts,
    table: {
      rows: tableRows,
      page: safePage,
      limit: safeLimit,
      total: orders.length,
      totalPages: Math.max(1, Math.ceil(orders.length / safeLimit)),
    },
    ...(csvContent !== undefined ? { csvContent } : {}),
  };
}

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const includeCsv = searchParams.get('export') === '1';
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '20', 10);
  const yearParam = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : null;
  const statusParam = searchParams.get('status');
  const data = await buildReportData(searchParams.get('from'), searchParams.get('to'), includeCsv, page, limit, yearParam, statusParam);
  if (includeCsv && data.csvContent) {
    const filename = `sales-report-${searchParams.get('from') || 'all'}-to-${searchParams.get('to') || 'now'}.csv`;
    return new NextResponse(data.csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !hasRole(auth.staffRole, ['super_admin', 'admin'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bot = getBot();
  if (!bot) {
    return NextResponse.json({ error: 'Telegram bot not configured' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string; status?: string };
  const data = await buildReportData(body.from ?? null, body.to ?? null, true, 1, 20, null, body.status ?? null);

  const filename = `sales-report-${body.from || 'all'}-to-${body.to || 'now'}.csv`;
  const caption = [
    `📊 *Sales Report*`,
    `Orders: ${data.summary.totalOrders} (Paid: ${data.summary.paidOrders})`,
    `Revenue: ${formatMoney(data.summary.paidRevenueUsdCents, 'USD')}${data.summary.paidRevenueKhr > 0 ? ` + ${formatMoney(data.summary.paidRevenueKhr, 'KHR')}` : ''}`,
  ].join('\n');

  await bot.api.sendDocument(
    auth.telegramUser.id,
    new InputFile(Buffer.from(data.csvContent ?? '', 'utf8'), filename),
    { caption, parse_mode: 'Markdown' },
  );

  return NextResponse.json({ ok: true });
}
