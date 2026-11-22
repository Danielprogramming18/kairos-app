import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import manifest from './package.json' with {type:'json'};
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const androidFiles = mode === 'android';
  return {
    // Relative base path so the built app works on any GitHub Pages subdirectory URL
    base: './',
    plugins: [
      {
        name: 'kairos-production-csp',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler: () => [
            {tag:'meta', attrs:{name:'kairos-version', content:manifest.version}},
            {tag:'meta', attrs:{name:'kairos-build', content:process.env.GITHUB_SHA || 'local'}},
            { tag: 'meta', attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'self'" + (mode === 'desktop' ? ' ipc: http://ipc.localhost' : ''),
          }, injectTo: 'head-prepend' as const }],
        },
      },
      react(),
      tailwindcss(),
      androidFiles && {
        name: 'kairos-local-file-entry',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            // A file: WebView cannot fetch an external ES module from its opaque origin.
            return html.replace(/<script type="module" crossorigin src=/g, '<script defer src=')
              .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ')
              .replace(/<link rel="manifest"[^>]*>/g, '');
          },
        },
      },
      !androidFiles && VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: './',
          name: 'کایروس | دستیار هوشمند تمرکز',
          short_name: 'کایروس',
          description: 'کایروس؛ دستیار شخصی و آفلاین-محور برای مدیریت کارها، برنامه‌ریزی روزانه، پیگیری عادت‌ها، یادداشت‌ها و تمرکز عمیق.',
          theme_color: '#4f46e5',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: './',
          scope: './',
          dir: 'rtl',
          lang: 'fa',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      ...(androidFiles && {
        outDir: 'build/android',
        modulePreload: false,
        assetsInlineLimit: (name: string) => name.endsWith('.woff2') || undefined,
        rolldownOptions: {
          transform: { define: { 'import.meta.url': 'document.baseURI', 'import.meta.resolve': 'undefined' } },
          output: { format: 'iife' as const, codeSplitting: false },
        },
      }),
      chunkSizeWarningLimit: 1200,
    },
    server: {
      hmr: false,
    },
  };
});
