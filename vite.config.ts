import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// En GitHub Pages la app vive en /better-emt/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { chunkSizeWarningLimit: 1600 },
  worker: { format: 'es' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Mejor EMT — ¿Qué bus cojo?',
        short_name: 'Mejor EMT',
        description: 'Planifica tus viajes en autobús EMT València',
        lang: 'es',
        theme_color: '#c60c30',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Red ciclista del Ajuntament (cambia poco)
            urlPattern: /^https:\/\/geoportal\.valencia\.es\/server\/rest\/services\/OPENDATA\/Trafico\/MapServer\/189\/query/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'bike-lanes',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            // Estilo, teselas, fuentes y sprites del mapa
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})
