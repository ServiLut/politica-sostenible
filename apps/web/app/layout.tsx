import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { AuthProvider } from "@/context/auth";
import { OfflineVaultProvider } from "@/context/offline-vault";
import { OfflineVaultPanel } from "@/components/pwa/OfflineVaultPanel";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { SkipNavLink } from "@/components/a11y/SkipNavLink";
import { ConfirmationProvider } from "@/context/confirmation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Política Sostenible | Operación verificable",
  description:
    "Sistema operativo multitenant para campañas responsables y atención ciudadana en Colombia.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Política Sostenible",
  },
};

export const viewport = {
  themeColor: "#1d4ed8",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A per-request CSP nonce can only be attached to dynamically rendered
  // framework scripts. The public offline fallback and static PWA assets remain
  // cacheable because they are served outside this React layout.
  await connection();

  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SkipNavLink />
        <ConfirmationProvider>
          <AuthProvider>
            <OfflineVaultProvider>
              {children}
              <OfflineVaultPanel />
            </OfflineVaultProvider>
          </AuthProvider>
        </ConfirmationProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
