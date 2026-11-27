'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useLang } from '@/components/LanguageContext';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface UIContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options, danger: true } : options;
    setConfirmState(opts);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const closeConfirm = (result: boolean) => {
    setConfirmState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Floating Toasts */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex flex-col items-center gap-2 px-4">
          {toasts.map((item) => (
            <div
              key={item.id}
              className={`page-transition pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold shadow-lg backdrop-blur-md ${
                item.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800'
                  : item.type === 'error'
                    ? 'border-rose-200 bg-rose-50/95 text-rose-800'
                    : 'border-slate-200 bg-white/95 text-slate-800'
              }`}
            >
              {item.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : item.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-sky-500" />
              )}
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Styled Confirm Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="page-transition w-full max-w-xs overflow-hidden rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  confirmState.danger ? 'bg-rose-50 text-rose-500' : 'bg-sky-50 text-sky-500'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {confirmState.title ?? (lang === 'km' ? 'បញ្ជាក់សកម្មភាព' : 'Please Confirm')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{confirmState.message}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {confirmState.cancelText ?? (lang === 'km' ? 'បោះបង់' : 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className={`btn-press flex-1 rounded-xl py-2 text-xs font-semibold text-white ${
                  confirmState.danger
                    ? 'bg-rose-500 hover:bg-rose-600'
                    : 'bg-sky-500 hover:bg-sky-600'
                }`}
              >
                {confirmState.confirmText ?? (lang === 'km' ? 'បញ្ជាក់' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('useUI must be used inside UIProvider');
  }
  return ctx;
}
