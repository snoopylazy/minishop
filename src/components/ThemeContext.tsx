'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ThemeSettings {
  bgColor: string;
  accentColor: string;
}

export const DEFAULT_THEME: ThemeSettings = {
  bgColor: '#ffffff',
  accentColor: '#0ea5e9',
};

export const BG_PRESETS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Soft Grey', value: '#f8fafc' },
  { label: 'Warm Cream', value: '#fffbeb' },
  { label: 'Mint', value: '#f0fdf4' },
  { label: 'Lavender', value: '#faf5ff' },
];

export const ACCENT_PRESETS = [
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Dark', value: '#0f172a' },
];

interface ThemeContextValue {
  theme: ThemeSettings;
  setTheme: (next: ThemeSettings) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function mixHex(hex: string, target: [number, number, number], weight: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb[0] * (1 - weight) + target[0] * weight);
  const g = Math.round(rgb[1] * (1 - weight) + target[1] * weight);
  const b = Math.round(rgb[2] * (1 - weight) + target[2] * weight);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function applyThemeToDom(theme: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty('--app-bg', theme.bgColor);
  root.style.setProperty('--color-sky-500', theme.accentColor);
  root.style.setProperty('--color-sky-600', mixHex(theme.accentColor, [0, 0, 0], 0.14));
  root.style.setProperty('--color-sky-700', mixHex(theme.accentColor, [0, 0, 0], 0.28));
  root.style.setProperty('--color-sky-400', mixHex(theme.accentColor, [255, 255, 255], 0.2));
  root.style.setProperty('--color-sky-200', mixHex(theme.accentColor, [255, 255, 255], 0.7));
  root.style.setProperty('--color-sky-100', mixHex(theme.accentColor, [255, 255, 255], 0.85));
  root.style.setProperty('--color-sky-50', mixHex(theme.accentColor, [255, 255, 255], 0.93));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSettings>(DEFAULT_THEME);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('miniapp_theme');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
        const loaded: ThemeSettings = {
          bgColor: parsed.bgColor || DEFAULT_THEME.bgColor,
          accentColor: parsed.accentColor || DEFAULT_THEME.accentColor,
        };
        setThemeState(loaded);
        applyThemeToDom(loaded);
        return;
      }
    } catch {
      // Ignore storage error
    }
    applyThemeToDom(DEFAULT_THEME);
  }, []);

  const setTheme = (next: ThemeSettings) => {
    setThemeState(next);
    applyThemeToDom(next);
    try {
      localStorage.setItem('miniapp_theme', JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  };

  const resetTheme = () => setTheme(DEFAULT_THEME);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
