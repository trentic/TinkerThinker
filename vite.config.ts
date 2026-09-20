import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Project pages on GitHub Pages serve from a /<repo>/ subpath. Set GH_PAGES=1
// only for that build (see `npm run build:pages`); local dev and other
// hosts (Vercel/Netlify) keep '/'.
const base = process.env.GH_PAGES ? '/TinkerThinker/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Fairway — Golf GPS & Scorecard',
        short_name: 'Fairway',
        description: 'Free, offline-friendly golf GPS, scorekeeping, and stats.',
        theme_color: '#166534',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'satellite-tiles',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-elevation',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 6 },
            },
          },
        ],
      },
    }),
  ],
})
