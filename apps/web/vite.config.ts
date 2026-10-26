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

/**
 * Where the app is served from: '/' at the root of a host, or a folder such as '/cobalt/' for a
 * GitHub Pages project site (BASE_PATH=/cobalt/ pnpm build). Routes live in the hash, so any
 * folder works.
 */
const base = `/${(process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      // A new version waits until the app applies it between sessions (see main.tsx), so an update
      // never reloads the page in the middle of a session.
      registerType: 'prompt',
      injectRegister: false,
      // The glob below already precaches every public file, icons included.
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'cobalt',
        short_name: 'cobalt',
        description: 'Full-screen color and soft sound that slows into a breathing rhythm.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111014',
        theme_color: '#111014',
        // A relaxation aid: no health category, so no store listing implies a medical purpose.
        categories: ['lifestyle'],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take control on the first visit, so the app works offline from then on.
        clientsClaim: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
