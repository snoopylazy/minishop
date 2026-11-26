'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'km';

const DICT = {
  en: {
    shopTitle: 'Shop',
    shopSubtitle: "Pick what you love, we'll handle the rest.",
    searchPlaceholder: 'Search products...',
    allCategories: 'All',
    addToCart: 'Add to Cart',
    outOfStock: 'Out of Stock',
    soldOut: 'Sold Out',
    left: 'left',
    inStock: 'in stock',
    inCart: 'in cart',
    noImage: 'No image',
    noProducts: 'No products found.',
    allProductsLoaded: 'All products loaded',
    item: 'item',
    items: 'items',
    myOrders: 'My Orders',
    backToShop: 'Back to shop',
    noOrders: 'No orders yet',
    noOrdersDesc: 'Your completed orders will show up here.',
    startShopping: 'Start Shopping',
    payNow: 'Pay Now',
    remove: 'Remove',
    reorder: 'Reorder',
    allOrdersLoaded: 'All orders loaded',
    orderSummary: 'Order Summary',
    deliveryInfo: 'Delivery Info',
    subtotal: 'Subtotal',
    deliveryFee: 'Delivery Fee',
    free: 'FREE',
    total: 'Total',
    nameOptional: 'Name',
    phone: 'Phone',
    address: 'Delivery Address',
    noteOptional: 'Note',
    pay: 'Pay',
    generatingQr: 'Generating QR…',
    uploadSlip: 'Upload Payment Slip',
    slipSent: 'Slip sent to seller — awaiting confirmation!',
    paymentConfirmed: 'Payment Confirmed!',
    keepShopping: 'Keep Shopping',
    emptyCart: 'Your cart is empty.',
    browseProducts: 'Browse products →',
    statusNew: 'New',
    statusPreparing: 'Preparing',
    statusShipped: 'Shipped',
    statusDelivered: 'Delivered',
    statusCancelled: 'Cancelled',
    paid: 'paid',
    pending: 'pending',
  },
  km: {
    shopTitle: 'ហាងទំនិញ',
    shopSubtitle: 'ជ្រើសរើសទំនិញដែលអ្នកស្រឡាញ់ យើងនឹងរៀបចំជូនអ្នក។',
    searchPlaceholder: 'ស្វែងរកទំនិញ...',
    allCategories: 'ទាំងអស់',
    addToCart: 'ដាក់ចូលកន្ត្រក',
    outOfStock: 'អស់ពីស្តុក',
    soldOut: 'អស់ស្តុក',
    left: 'នៅសល់',
    inStock: 'មានក្នុងស្តុក',
    inCart: 'ក្នុងកន្ត្រក',
    noImage: 'គ្មានរូបភាព',
    noProducts: 'រកមិនឃើញទំនិញទេ។',
    allProductsLoaded: 'បានបង្ហាញទំនិញទាំងអស់',
    item: 'មុខ',
    items: 'មុខ',
    myOrders: 'ការបញ្ជាទិញ',
    backToShop: 'ត្រឡប់ទៅហាង',
    noOrders: 'មិនទាន់មានការបញ្ជាទិញ',
    noOrdersDesc: 'ការបញ្ជាទិញរបស់អ្នកនឹងបង្ហាញនៅទីនេះ។',
    startShopping: 'ចាប់ផ្តើមទិញទំនិញ',
    payNow: 'បង់ប្រាក់ឥឡូវ',
    remove: 'លុបចេញ',
    reorder: 'ទិញម្តងទៀត',
    allOrdersLoaded: 'បានបង្ហាញការបញ្ជាទិញទាំងអស់',
    orderSummary: 'សង្ខេបការបញ្ជាទិញ',
    deliveryInfo: 'ព័ត៌មានដឹកជញ្ជូន',
    subtotal: 'សរុបរង',
    deliveryFee: 'ថ្លៃដឹកជញ្ជូន',
    free: 'ឥតគិតថ្លៃ',
    total: 'សរុបទាំងអស់',
    nameOptional: 'ឈ្មោះ',
    phone: 'លេខទូរស័ព្ទ',
    address: 'អាសយដ្ឋានដឹកជញ្ជូន',
    noteOptional: 'ចំណាំ',
    pay: 'បង់ប្រាក់',
    generatingQr: 'កំពុងបង្កើត QR…',
    uploadSlip: 'ផ្ញើវិក្កយបត្របង់ប្រាក់',
    slipSent: 'បានផ្ញើវិក្កយបត្រទៅអ្នកលក់ — កំពុងរង់ចាំបញ្ជាក់!',
    paymentConfirmed: 'ការបង់ប្រាក់បានជោគជ័យ!',
    keepShopping: 'បន្តទិញទំនិញ',
    emptyCart: 'កន្ត្រករបស់អ្នកទទេ។',
    browseProducts: 'មើលទំនិញ →',
    statusNew: 'ថ្មី',
    statusPreparing: 'កំពុងរៀបចំ',
    statusShipped: 'កំពុងដឹក',
    statusDelivered: 'បានដឹកជូន',
    statusCancelled: 'បានបោះបង់',
    paid: 'បានបង់',
    pending: 'រង់ចាំបង់',
  },
} as const;

export type DictKey = keyof typeof DICT.en;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('miniapp_lang');
      if (saved === 'km' || saved === 'en') {
        setLangState(saved);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem('miniapp_lang', next);
    } catch {
      // Ignore storage error
    }
  };

  const t = (key: DictKey): string => DICT[lang][key] ?? DICT.en[key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLang must be used inside LanguageProvider');
  }
  return ctx;
}
