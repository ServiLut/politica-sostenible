import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/auth";
import { CRMProvider } from "@/context/CRMContext";
import { ToastProvider } from "@/context/ToastContext";
import ReactQueryProvider from "@/context/ReactQueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Politica Sostenible CRM - Colombia 2026",
  description: "Plataforma de inteligencia electoral y control territorial",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReactQueryProvider>
          <AuthProvider>
            <CRMProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </CRMProvider>
          </AuthProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
