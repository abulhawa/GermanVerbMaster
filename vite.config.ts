import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "manifest.webmanifest",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === "/api/verbs",
            handler: "StaleWhileRevalidate",
            method: "GET",
            options: {
              cacheName: "verbs-list",
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/verbs/"),
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "verb-details",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
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
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("recharts")) {
            return "recharts";
          }

          if (id.includes("@tanstack/react-query")) {
            return "react-query";
          }

          if (id.includes("@radix-ui")) {
            return "radix";
          }

          if (id.includes("lucide-react")) {
            return "icons";
          }

          if (id.includes("date-fns")) {
            return "date-fns";
          }

          if (id.includes("dexie")) {
            return "dexie";
          }

          if (id.includes("embla-carousel")) {
            return "carousel";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "attached_assets"), path.resolve(__dirname, "data")],
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./vitest.setup.ts",
    include: ["../tests/**/*.test.ts", "src/**/*.{test,spec}.{ts,tsx}"],
  },
});
