import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'امانت‌ها',
        short_name: 'امانت‌ها',
        description: 'ردیابی امانت‌های پولی',
        theme_color: '#0f6b6b',
        background_color: '#f4efe6',
        display: 'standalone',
        lang: 'fa',
        dir: 'rtl',
        start_url: '/',
        // Pinned so the app identity survives a future start_url change —
        // without it, changing start_url orphans every existing install.
        id: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: 'screenshots/screenshot-narrow.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
          },
          {
            src: 'screenshots/screenshot-wide.png',
            sizes: '1920x1080',
            type: 'image/png',
            form_factor: 'wide',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Only the browser's install sheet ever fetches these, so precaching
        // them would be pure install weight.
        globIgnores: ['**/screenshots/**'],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
