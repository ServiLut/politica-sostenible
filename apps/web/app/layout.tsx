import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { AuthProvider } from "@/context/auth";
import { OfflineVaultProvider } from "@/context/offline-vault";
import { OfflineVaultPanel } from "@/components/pwa/OfflineVaultPanel";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { SkipNavLink } from "@/components/a11y/SkipNavLink";
import { ConfirmationProvider } from "@/context/confirmation";
import { allowsLocalEvaluationHttp } from "@/lib/local-evaluation-http";

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

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  interactiveWidget: "resizes-content",
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
        data-local-evaluation={allowsLocalEvaluationHttp() ? "true" : undefined}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SkipNavLink />
        {allowsLocalEvaluationHttp() && (
          <div
            role="note"
            aria-label="Identificación del entorno de pruebas"
            className="relative z-[120] flex h-7 items-center justify-center border-b border-amber-300 bg-amber-100 px-2 text-center text-xs font-semibold text-amber-950"
          >
            Entorno local de pruebas · datos sintéticos
          </div>
        )}
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
