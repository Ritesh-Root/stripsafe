import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vitest/config'

import { hydrateSnapshot, serializePublicSnapshot } from './src/lib/publish'

function publishAlerts(): Plugin {
  const write = () => {
    const source = path.resolve('data/alerts.json')
    const snapshot = hydrateSnapshot(JSON.parse(readFileSync(source, 'utf8')))
    const dir = path.resolve('public/data')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'alerts.json'), serializePublicSnapshot(snapshot))
  }
  return {
    name: 'stripsafe-alerts',
    buildStart: write,
    configureServer: write,
  }
}

export default defineConfig({
  base: '/stripsafe/',
  plugins: [
    publishAlerts(),
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,csv}'],
        globIgnores: ['**/data/**'],
        navigateFallback: '/stripsafe/index.html',
        navigateFallbackDenylist: [/^\/stripsafe\/data\//],
        runtimeCaching: [
          {
            urlPattern: /\/data\/alerts\.json(?:\?.*)?$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cdsco-alerts',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/tesseract.js')) return 'tesseract'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
