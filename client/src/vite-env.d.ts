/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
  interface ImportMetaEnv {
    readonly ENABLE_ADMIN_FEATURES?: string;
  }
}

export {};
