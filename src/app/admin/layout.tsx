import React from 'react';
import { AdminPinGate } from '@/components/AdminPinGate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminPinGate>{children}</AdminPinGate>;
}
