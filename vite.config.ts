import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        includeAssets: [
          'apple-touch-icon.png',
          'icon.svg',
          'privacy-policy.html',
          '.well-known/assetlinks.json',
          'widgets/active-order-template.json',
          'widgets/active-order-data.json',
        ],
        manifest: {
          id: '/',
          name: 'HSP delivery — Hasilpur & Pakistan Delivery',
          short_name: 'HSP delivery',
          description:
            'Order from Hasilpur & Pakistan restaurants and local stores with live GPS tracking, Cash on Delivery, JazzCash, EasyPaisa, and instant rider dispatch.',
          lang: 'en',
          dir: 'ltr',
          orientation: 'portrait',
          categories: ['food', 'shopping', 'lifestyle'],
          theme_color: '#07070A',
          background_color: '#07070A',
          display: 'standalone',
          display_override: [
            'tabbed',
            'window-controls-overlay',
            'standalone',
            'minimal-ui',
            'browser',
          ],
          tab_strip: {
            home_tab: {
              url: '/',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
            new_tab_button: {
              url: '/?tab=order',
            },
          },
          start_url: '/',
          scope: '/',
          launch_handler: {
            client_mode: ['navigate-existing', 'auto'],
          },
          edge_side_panel: {
            preferred_width: 400,
          },
          iarc_rating_id: 'e58c174a-81d2-5c3c-32cc-34b8de4a52e9',
          prefer_related_applications: false,
          related_applications: [
            {
              platform: 'play',
              url: 'https://play.google.com/store/apps/details?id=com.hspdelivery.app',
              id: 'com.hspdelivery.app',
            },
          ],
          scope_extensions: [
            {
              origin:
                'https://ais-pre-jjyvyo7m4unbdm4dz4upjq-756142993760.asia-southeast1.run.app',
            },
          ],
          shortcuts: [
            {
              name: 'Order Food & Shops',
              short_name: 'Order Now',
              description: 'Browse Hasilpur restaurants, groceries, pharmacies & local stores',
              url: '/?tab=order',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
            {
              name: 'Track Live Delivery',
              short_name: 'Track Order',
              description: 'Follow your active order timeline and live rider GPS location',
              url: '/?tab=track',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
            {
              name: 'Rider Dispatch Portal',
              short_name: 'Rider',
              description: 'Accept deliveries, call customers in one tap & navigate routes',
              url: '/?tab=rider',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
            {
              name: 'Privacy Policy',
              short_name: 'Privacy',
              description: 'Read HSP delivery Privacy & Data Protection Policy',
              url: '/?privacy=1',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
          ],
          share_target: {
            action: '/?share=1',
            method: 'GET',
            enctype: 'application/x-www-form-urlencoded',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
            },
          },
          protocol_handlers: [
            {
              protocol: 'web+hspdelivery',
              url: '/?protocol=%s',
            },
          ],
          file_handlers: [
            {
              action: '/?open-file=1',
              accept: {
                'application/json': ['.hsporder', '.json'],
                'text/plain': ['.txt'],
              },
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
              launch_type: 'single-client',
            },
          ],
          note_taking: {
            new_note_url: '/?note=1',
          },
          widgets: [
            {
              name: 'HSP delivery Live Order',
              short_name: 'HSP Order',
              description: 'Quick status summary and one-tap links to track or place orders on HSP delivery.',
              tag: 'hsp-delivery-status',
              template: 'hsp-order-card',
              ms_ac_template: '/widgets/active-order-template.json',
              data: '/widgets/active-order-data.json',
              type: 'application/json',
              screenshots: [
                {
                  src: '/pwa-512x512.png',
                  sizes: '512x512',
                  label: 'HSP delivery live order status widget',
                },
              ],
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
              auth: false,
              update: 900,
            },
          ],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        } as Record<string, unknown>,
        injectManifest: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react';
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase';
            if (id.includes('/recharts/') || id.includes('/d3-')) return 'vendor-charts';
            if (id.includes('/@vis.gl/react-google-maps')) return 'vendor-maps';
            if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'vendor-motion';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      cors: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
