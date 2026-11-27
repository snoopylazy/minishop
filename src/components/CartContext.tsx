'use client';

import React, { createContext, useContext, useState } from 'react';

export interface CartProduct {
  id: number;
  name: string;
  priceCents: number;
  currency: string;
  stock: number;
  imageUrl: string | null;
}

export interface CartItem extends CartProduct {
  quantity: number;
  variant?: string | null;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (product: CartProduct, variant?: string | null) => void;
  updateQuantity: (productId: number, quantity: number, variant?: string | null) => void;
  clearCart: () => void;
  totalCents: number;
  totalCount: number;
  currency: string;
}

const CartContext = createContext<CartContextValue | null>(null);

function sameLine(item: CartItem, productId: number, variant?: string | null) {
  return item.id === productId && (item.variant ?? null) === (variant ?? null);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (product: CartProduct, variant: string | null = null) => {
    setItems((prev) => {
      const totalForProduct = prev
        .filter((i) => i.id === product.id)
        .reduce((sum, i) => sum + i.quantity, 0);
      if (totalForProduct >= product.stock) return prev;

      const existing = prev.find((i) => sameLine(i, product.id, variant));
      if (existing) {
        return prev.map((i) =>
          sameLine(i, product.id, variant) ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      if (product.stock <= 0) return prev;
      return [...prev, { ...product, variant, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, quantity: number, variant: string | null = null) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => !sameLine(i, productId, variant));
      }
      const otherQty = prev
        .filter((i) => i.id === productId && !sameLine(i, productId, variant))
        .reduce((sum, i) => sum + i.quantity, 0);
      return prev.map((i) =>
        sameLine(i, productId, variant)
          ? { ...i, quantity: Math.min(quantity, Math.max(0, i.stock - otherQty)) }
          : i,
      );
    });
  };

  const clearCart = () => setItems([]);

  const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const currency = items[0]?.currency ?? 'USD';

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        clearCart,
        totalCents,
        totalCount,
        currency,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return ctx;
}
