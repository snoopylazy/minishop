'use client';

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

let telegramInitialized = false;

export function initTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const wa = window.Telegram?.WebApp;
  if (wa) {
    if (!telegramInitialized) {
      telegramInitialized = true;
      wa.ready();
      wa.expand();
    }
    return wa;
  }
  return null;
}

export function getTelegramAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const initData = window.Telegram?.WebApp?.initData ?? '';
  const headers: Record<string, string> = {};
  if (initData) {
    headers['x-telegram-init-data'] = initData;
  } else {
    const devId = window.localStorage.getItem('dev_telegram_id');
    if (devId) {
      headers['x-dev-telegram-id'] = devId;
    }
  }
  return headers;
}

export function formatMoney(cents: number, currency = 'USD'): string {
  if (currency === 'KHR') {
    return `${cents.toLocaleString('en-US')} ៛`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}
