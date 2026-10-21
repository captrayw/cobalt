import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * In production builds, a Content-Security-Policy that allows only this origin: no third-party
 * scripts, fonts, analytics or network requests. (Dev mode needs Vite's inline HMR script.)
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'calm-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // The glob below already precaches every public file, icons included.
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'Calm Scroll',
        short_name: 'Calm Scroll',
        description: 'Fifteen minutes of soft color and sound that slows into a breathing rhythm.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#090C12',
        theme_color: '#090C12',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take control on the first visit, so the app works offline from then on.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
