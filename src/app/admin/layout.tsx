import React from 'react';
import { AdminPinGate } from '@/components/AdminPinGate';
import { AdminBottomNav } from '@/components/AdminBottomNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminPinGate>
      <div className="pb-16">{children}</div>
      <AdminBottomNav />
    </AdminPinGate>
  );
}
