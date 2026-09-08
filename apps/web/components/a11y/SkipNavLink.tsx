"use client";

import { usePathname } from "next/navigation";
import { getSkipNavigationTarget } from "@/lib/skip-navigation";

export function SkipNavLink() {
  const pathname = usePathname();

  return (
    <a
      href={getSkipNavigationTarget(pathname)}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
    >
      Saltar al contenido principal
    </a>
  );
}
