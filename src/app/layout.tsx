import type { Metadata } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono, Kantumruy_Pro } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/components/CartContext';
import { ThemeProvider } from '@/components/ThemeContext';
import { LanguageProvider } from '@/components/LanguageContext';
import { UIProvider } from '@/components/UIContext';
import { CustomerBottomNav } from '@/components/CustomerBottomNav';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const kantumruyPro = Kantumruy_Pro({
  variable: '--font-khmer',
  subsets: ['khmer', 'latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Telegram Mini App Store',
  description: 'MVP Telegram Mini App E-Commerce Storefront',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${kantumruyPro.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full text-slate-900 flex flex-col">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <LanguageProvider>
          <ThemeProvider>
            <UIProvider>
              <CartProvider>
                {children}
                <CustomerBottomNav />
              </CartProvider>
            </UIProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
