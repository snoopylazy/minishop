'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, X, Eye, EyeOff } from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import { getTelegramAuthHeaders } from '@/lib/client-telegram';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLang } from '@/components/LanguageContext';
import { useUI } from '@/components/UIContext';

interface StaffUser {
  id: number;
  telegramId: string;
  username: string | null;
  name: string;
  role: 'admin' | 'seller';
  isActive: boolean;
  notifyOrders: boolean;
  pin?: string | null;
}

export default function AdminStaffPage() {
  const { t, lang } = useLang();
  const { confirm, toast } = useUI();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [superAdminId, setSuperAdminId] = useState<string | null>(null);
  const [myTelegramId, setMyTelegramId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'seller' | 'active' | 'disabled'>('all');
  const [telegramId, setTelegramId] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'seller'>('seller');
  const [pin, setPin] = useState('');
  const [editingMember, setEditingMember] = useState<StaffUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'seller'>('seller');
  const [editPinInput, setEditPinInput] = useState('');
  const [showEditPin, setShowEditPin] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(async (pageNum = 1, replace = true) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetch(`/api/staff?page=${pageNum}&limit=20`, {
        headers: getTelegramAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStaff((prev) => (replace ? (data.staff ?? []) : [...prev, ...(data.staff ?? [])]));
        setHasMore(data.hasMore ?? false);
        setPage(pageNum);
        setSuperAdminId(data.superAdminTelegramId ?? null);
      } else {
        setError('Super Admin access required.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadStaff(1, true);
    fetch('/api/me', { headers: getTelegramAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (me?.telegramUser?.id) setMyTelegramId(me.telegramUser.id);
      })
      .catch(() => {});
  }, [loadStaff]);

  const sentinelRef = useInfiniteScroll(() => {
    if (!loadingMore && hasMore) loadStaff(page + 1, false);
  }, hasMore && !loadingMore);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({ telegramId, name, username, role, pin: pin.trim() || undefined }),
      });

      if (res.ok) {
        setTelegramId('');
        setName('');
        setUsername('');
        setPin('');
        toast('Staff saved!', 'success');
        await loadStaff();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.error ?? 'Failed to add staff user';
        setError(msg);
        toast(msg, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const updateStaff = async (
    id: number,
    patch: {
      name?: string;
      username?: string | null;
      role?: 'admin' | 'seller';
      isActive?: boolean;
      notifyOrders?: boolean;
      pin?: string | null;
    },
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
      toast(patch.pin === 'OFF' ? 'PIN turned off' : 'Updated!', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Failed to update staff', 'error');
    }
  };

  const deleteStaff = async (member: StaffUser) => {
    const ok = await confirm(`Delete ${member.name} (${member.telegramId})?`);
    if (!ok) {
      return;
    }
    const res = await fetch(`/api/staff/${member.id}`, {
      method: 'DELETE',
      headers: getTelegramAuthHeaders(),
    });
    if (res.ok) {
      setStaff((prev) => prev.filter((s) => s.id !== member.id));
      toast('Staff member deleted', 'success');
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">{t('staffRolesTitle')}</h1>
          {superAdminId && (
            <p className="text-xs text-slate-500">
              {t('rootSuperAdminId')}: <span className="font-mono">{superAdminId}</span>
            </p>
          )}
        </div>

        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-slate-900">{t('addAdminOrSeller')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Telegram User ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 123456789"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Staff Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Staff Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
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
            <input
              type="password"
              inputMode="numeric"
              placeholder="Personal PIN (4-12 digits, optional)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('saveStaffMember')}
          </button>
        </form>

        <div className="mb-3 space-y-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'km' ? 'ស្វែងរកឈ្មោះ @username ឬ Telegram ID...' : 'Search staff name, @username, or Telegram ID...'}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['all', 'admin', 'seller', 'active', 'disabled'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setRoleFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                  roleFilter === f
                    ? 'bg-sky-500 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'all'
                  ? t('allCategories')
                  : f === 'admin'
                    ? 'Admin'
                    : f === 'seller'
                      ? t('seller')
                      : f === 'active'
                        ? t('activeBtn')
                        : t('disabledBtn')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))}
          </div>
        ) : (
        <div className="space-y-2.5">
          {staff
            .filter((member) => {
              if (roleFilter === 'admin' && member.role !== 'admin') return false;
              if (roleFilter === 'seller' && member.role !== 'seller') return false;
              if (roleFilter === 'active' && !member.isActive) return false;
              if (roleFilter === 'disabled' && member.isActive) return false;
              if (!search.trim()) return true;
              const q = search.trim().toLowerCase();
              return (
                member.name.toLowerCase().includes(q) ||
                member.telegramId.toLowerCase().includes(q) ||
                (member.username ?? '').toLowerCase().includes(q)
              );
            })
            .map((member) => {
              const isSelf = Boolean(myTelegramId && member.telegramId === myTelegramId);
              return (
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
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs text-slate-500">ID: {member.telegramId}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      member.pin && member.pin !== 'OFF'
                        ? 'bg-sky-50 text-sky-700'
                        : member.pin === 'OFF'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {member.pin && member.pin !== 'OFF'
                      ? 'PIN ON'
                      : member.pin === 'OFF'
                        ? 'PIN OFF'
                        : 'DEFAULT PIN'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  disabled={isSelf}
                  onChange={(e) =>
                    updateStaff(member.id, { role: e.target.value as 'admin' | 'seller' })
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <option value="seller">Seller</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMember(member);
                    setEditName(member.name);
                    setEditUsername(member.username ?? '');
                    setEditRole(member.role);
                    setEditPinInput(member.pin && member.pin !== 'OFF' ? member.pin : '');
                    setShowEditPin(false);
                    setEditError(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('editBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => updateStaff(member.id, { notifyOrders: !member.notifyOrders })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    member.notifyOrders !== false
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {member.notifyOrders !== false ? t('alertsOn') : t('alertsOff')}
                </button>
                <button
                  type="button"
                  disabled={isSelf}
                  onClick={() => updateStaff(member.id, { isActive: !member.isActive })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                    member.isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {member.isActive ? t('activeBtn') : t('disabledBtn')}
                </button>
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => deleteStaff(member)}
                    className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    {t('deleteLabel')}
                  </button>
                )}
              </div>
            </div>
              );
            })}
        </div>
        )}

        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <div className="mt-4 flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
          </div>
        )}
        {!hasMore && staff.length > 0 && (
          <p className="mt-4 text-center text-xs text-slate-400">{t('allStaffLoaded')}</p>
        )}
      </main>

      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Edit Staff Details</h2>
                <p className="font-mono text-[11px] text-slate-400">ID: {editingMember.telegramId}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditError(null);
                if (!editName.trim()) {
                  setEditError('Name is required.');
                  return;
                }
                const trimmedPin = editPinInput.trim();
                if (trimmedPin && (trimmedPin.length < 4 || trimmedPin.length > 12)) {
                  setEditError('PIN must be 4 to 12 characters.');
                  return;
                }
                setSavingEdit(true);
                try {
                  await updateStaff(editingMember.id, {
                    name: editName.trim(),
                    username: editUsername.trim() || null,
                    role: editRole,
                    ...(trimmedPin ? { pin: trimmedPin } : {}),
                  });
                  setEditingMember(null);
                } finally {
                  setSavingEdit(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Telegram @username (optional)
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Role</label>
                <select
                  value={editRole}
                  disabled={Boolean(myTelegramId && editingMember.telegramId === myTelegramId)}
                  onChange={(e) => setEditRole(e.target.value as 'admin' | 'seller')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:bg-white disabled:opacity-50"
                >
                  <option value="seller">Seller (Orders & Fulfillment)</option>
                  <option value="admin">Admin (Products + Orders)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                  PIN (leave empty to keep current)
                </label>
                <div className="relative">
                  <input
                    type={showEditPin ? 'text' : 'password'}
                    inputMode="numeric"
                    placeholder="4-12 digits"
                    value={editPinInput}
                    onChange={(e) => setEditPinInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-sm tracking-widest outline-none focus:border-sky-400 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPin((v) => !v)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                    aria-label={showEditPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showEditPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {editError && <p className="text-xs font-medium text-rose-600">{editError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={async () => {
                    const ok = await confirm(`Turn off PIN for ${editingMember.name}?`);
                    if (!ok) return;
                    setSavingEdit(true);
                    try {
                      await updateStaff(editingMember.id, { pin: 'OFF' });
                      setEditingMember(null);
                    } finally {
                      setSavingEdit(false);
                    }
                  }}
                  className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                >
                  Turn Off PIN
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 rounded-xl bg-sky-500 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
