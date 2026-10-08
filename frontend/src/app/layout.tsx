import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';
import { AuthBootstrap } from '@/shared/auth/auth-bootstrap';

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SIC | Sistema Inteligente de Cobranza — Cofersa',
  description: 'Sistema Inteligente de Cobranza — Cofersa',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SIC Cofersa',
  },
};

export const viewport: Viewport = {
  themeColor: '#003B5C',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${nunito.variable} h-full`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-nunito)] antialiased">
        <AuthBootstrap />
        {children}
      </body>
    </html>
  );
}
