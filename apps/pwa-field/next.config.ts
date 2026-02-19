import type { NextConfig } from "next";
import nextPWA from "next-pwa";

const withPWA = nextPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = withPWA({
  /* config options here */
  reactStrictMode: true,
  turbopack: {},
});

export default nextConfig;
