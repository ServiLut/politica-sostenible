import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Toaster from '@/components/ui/Toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'CRM Político V4.2',
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
      </body>
    </html>
  );
}