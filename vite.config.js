import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Concentrates',
        short_name: 'Concentrates',
        description: 'Управление производством концентратов и эмульсии',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1e40af',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-256.png',
            sizes: '256x256',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Don't fall back to index.html for API-shaped paths. We don't ship
        // /api/* today (Supabase calls are cross-origin), but kept as
        // defense-in-depth for any future first-party endpoint.
        navigateFallbackDenylist: [/^\/api\//],

        // Critical for production-tracking correctness: never cache Supabase
        // responses. Stale ingredient stock or recipe data on a stale tab
        // could lead to the operator producing against numbers that don't
        // match reality.
        //
        // The rule below covers /rest/v1/* (data), /auth/v1/* (sessions),
        // /storage/v1/* and /realtime/v1/* (defense-in-depth — not used yet).
        // Default method is GET; non-GET requests aren't matched by
        // runtimeCaching at all, so they pass straight through.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
