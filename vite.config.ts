import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/stripsafe/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'samples/sample-strip.png', 'samples/invoice-sample.csv'],
      manifest: {
        name: 'StripSafe',
        short_name: 'StripSafe',
        description: 'Check a medicine batch against CDSCO quality alerts. Never calls a medicine safe.',
        start_url: '/stripsafe/',
        scope: '/stripsafe/',
        display: 'standalone',
        background_color: '#f1f1f1',
        theme_color: '#1b1b1b',
        lang: 'en',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,csv,json}'],
        navigateFallback: '/stripsafe/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js.*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
