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
}

interface CartContextValue {
  items: CartItem[];
  addItem: (product: CartProduct) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalCents: number;
  totalCount: number;
  currency: string;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (product: CartProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      if (product.stock <= 0) return prev;
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => i.id !== productId);
      }
      return prev.map((i) =>
        i.id === productId ? { ...i, quantity: Math.min(quantity, i.stock) } : i,
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
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
