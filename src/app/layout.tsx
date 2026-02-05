import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Toaster from '@/components/ui/Toaster';
import SessionTimeout from '@/components/security/SessionTimeout';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Política Sostenible',
  description: 'Sistema de Inteligencia Electoral',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
        <Toaster />
        <SessionTimeout />
      </body>
    </html>
  );
}