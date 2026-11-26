'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';
import { getTelegramAuthHeaders } from '@/lib/client-telegram';

interface StaffUser {
  id: number;
  telegramId: string;
  username: string | null;
  name: string;
  role: 'admin' | 'seller';
  isActive: boolean;
}

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [superAdminId, setSuperAdminId] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'seller'>('seller');
  const [error, setError] = useState<string | null>(null);

  const loadStaff = async () => {
    const res = await fetch('/api/staff', { headers: getTelegramAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setStaff(data.staff ?? []);
      setSuperAdminId(data.superAdminTelegramId ?? null);
    } else {
      setError('Super Admin access required.');
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ telegramId, name, username, role }),
    });

    if (res.ok) {
      setTelegramId('');
      setName('');
      setUsername('');
      await loadStaff();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to add staff user');
    }
  };

  const updateStaff = async (
    id: number,
    patch: { role?: 'admin' | 'seller'; isActive?: boolean },
  ) => {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Staff & Roles</h1>
            {superAdminId && (
              <p className="text-xs text-slate-500">
                Root Super Admin ID: <span className="font-mono">{superAdminId}</span>
              </p>
            )}
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Back to Orders
          </Link>
        </div>

        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-slate-900">Add Admin or Seller</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              placeholder="Telegram User ID * (e.g. 123456789)"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Staff Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Telegram @username (optional)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'seller')}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="seller">Seller (Orders & Fulfillment)</option>
              <option value="admin">Admin (Products + Orders)</option>
            </select>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Save Staff Member
          </button>
        </form>

        <div className="space-y-2.5">
          {staff.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {member.name}{' '}
                  {member.username && (
                    <span className="text-xs font-normal text-slate-500">@{member.username}</span>
                  )}
                </p>
                <p className="font-mono text-xs text-slate-500">ID: {member.telegramId}</p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) =>
                    updateStaff(member.id, { role: e.target.value as 'admin' | 'seller' })
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="seller">Seller</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => updateStaff(member.id, { isActive: !member.isActive })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    member.isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {member.isActive ? 'Active' : 'Disabled'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
