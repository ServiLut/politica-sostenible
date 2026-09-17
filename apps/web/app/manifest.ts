import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Política Sostenible",
    short_name: "PolSost",
    description:
      "Plataforma de gestión para operaciones políticas sostenibles y verificables.",
    lang: "es-CO",
    dir: "ltr",
    start_url: "/aplicacion?origen=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#0f172a",
    theme_color: "#1d4ed8",
    orientation: "any",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Ingresar al sistema",
        short_name: "Ingresar",
        description: "Abrir el acceso seguro a Política Sostenible.",
        url: "/iniciar-sesion?origen=pwa",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
