import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iPhone app: the same web app, built with base '/' and bundled inside a native shell
 * (Capacitor). It is served from the app itself, so it works offline from the first launch and
 * makes no network requests. `pnpm --filter @calm/web ios:build` builds the web app and copies it
 * into ios/; the Xcode project lives in ios/App.
 */
const config: CapacitorConfig = {
  appId: 'com.acolorcompany.cobalt',
  appName: 'cobalt',
  webDir: 'dist',
  ios: {
    // The feed reaches every edge; its controls keep clear of the notch with safe-area insets.
    contentInset: 'never',
    // A long press would open a link preview instead of reaching the feed.
    allowsLinkPreview: false,
  },
  plugins: {
    // No status bar over the colors, and a home indicator that fades until the screen is touched.
    SystemBars: { hidden: true },
  },
};

export default config;
