import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Support custom base path for GitHub Pages or relative base for Electron
  base: process.env.VITE_BASE_PATH || (mode === 'electron' ? './' : '/'),
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
  },
  plugins: [
    react(),
    {
      name: 'copy-404-for-spa',
      closeBundle() {
        const distIndex = path.resolve(__dirname, 'dist/index.html');
        const dist404 = path.resolve(__dirname, 'dist/404.html');
        if (fs.existsSync(distIndex)) {
          fs.copyFileSync(distIndex, dist404);
        }
      },
    },
    {
      name: 'dev-sw-cleaner',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/sw.js' || req.url === '/registerSW.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(`
              self.addEventListener('install', (e) => {
                self.skipWaiting();
              });
              self.addEventListener('activate', (e) => {
                self.clients.claim().then(() => {
                  self.registration.unregister().then(() => {
                    console.log('Dev SW Cleaner: Stale service worker unregistered.');
                  });
                });
              });
            `);
            return;
          }
          next();
        });
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'MFLedger',
        short_name: 'MFLedger',
        description: 'Local-first Indian mutual fund portfolio tracker',
        theme_color: '#0B1021',
        background_color: '#0B1021',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/ImportCSVModal-*.js', '**/CartesianChart-*.js'],
        runtimeCaching: [
          {
            urlPattern: /.*(?:ImportCSVModal|CartesianChart).*\.js$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'on-demand-modules',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'esnext',
    // Fix #4: Never expose TypeScript source maps in production.
    // Sourcemaps reveal your original source code in DevTools → Sources.
    sourcemap: false,
    // Fix #10: Strip all console.* calls from the production bundle.
    // This prevents sensitive data (e.g. debug logs) from being visible in DevTools.
    minify: 'oxc',
  },
  define: process.env.NODE_ENV === 'production' ? {
    'console.log': '(() => {})',
    'console.error': '(() => {})',
    'console.warn': '(() => {})',
    'console.info': '(() => {})',
    'console.debug': '(() => {})',
  } : {},
}))
