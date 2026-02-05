import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: "#111827",
          white: "#FFFFFF",
          gray: {
            50: "#F9FAFB",
            100: "#F3F4F6",
            200: "#E5E7EB",
            500: "#6B7280",
            900: "#111827",
          },
          green: {
            50: "#F0FDF4",
            100: "#DCFCE7",
            200: "#BBF7D0",
            500: "#22C55E",
            600: "#16A34A",
            700: "#15803D",
          }
        }
      },
      boxShadow: {
        'soft-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)',
      }
    },
  },
  plugins: [],
};
export default config;