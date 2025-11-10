import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { VitePWA } from "vite-plugin-pwa";

import { classifyManualChunk } from "./scripts/manual-chunks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "manifest.webmanifest",
        "packs/*.json",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/tasks"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "tasks-feed",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/packs/"),
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "content-packs",
              matchOptions: { ignoreSearch: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@db": path.resolve(__dirname, "db"),
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
      "@verbs-data": path.resolve(__dirname, "data", "generated"),
    },
  },
  envPrefix: ["VITE_", "ENABLE_"],
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: classifyManualChunk,
      },
    },
  },
  server: {
    /**
     * The Express dev server (see server/vite.ts) mounts Vite in middleware mode and
     * serves both API routes and client assets from http://localhost:5000. Because
     * Express handles /api requests directly, no explicit proxy is needed here when
     * you run `npm run dev`. If you start a standalone Vite server instead, proxy
     * /api/* requests to http://localhost:5000 so they continue to hit Express.
     */
    fs: {
      allow: [
        path.resolve(__dirname, "client"),
        path.resolve(__dirname, "attached_assets"),
        path.resolve(__dirname, "data"),
      ],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    include: ["../tests/**/*.test.ts", "src/**/*.{test,spec}.{ts,tsx}"],
  },
});
