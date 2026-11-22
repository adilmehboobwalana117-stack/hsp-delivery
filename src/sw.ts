import { clientsClaim } from 'workbox-core';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface PeriodicSyncEventLike extends ExtendableEventLike {
  readonly tag: string;
}

interface SyncEventLike extends ExtendableEventLike {
  readonly tag: string;
}

interface PushEventLike extends ExtendableEventLike {
  readonly data?: {
    json(): Record<string, unknown>;
    text(): string;
  } | null;
}

interface NotificationEventLike extends ExtendableEventLike {
  readonly notification: Notification & { data?: { url?: string } };
}

interface WindowClientLike {
  url: string;
  focused?: boolean;
  focus(): Promise<WindowClientLike>;
  postMessage(message: unknown): void;
}

interface SWGlobalScopeLike {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  skipWaiting(): Promise<void>;
  registration: ServiceWorkerRegistration;
  clients: {
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<WindowClientLike | null>;
  };
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  addEventListener(type: 'periodicsync', listener: (event: PeriodicSyncEventLike) => void): void;
  addEventListener(type: 'sync', listener: (event: SyncEventLike) => void): void;
  addEventListener(type: 'push', listener: (event: PushEventLike) => void): void;
  addEventListener(
    type: 'notificationclick',
    listener: (event: NotificationEventLike) => void
  ): void;
}

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

const sw = self as unknown as SWGlobalScopeLike;

// Activate updated service worker immediately
sw.skipWaiting();
clientsClaim();

// Precache all Vite-built assets and remove outdated caches
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA Navigation fallback for offline support (preserving standalone static assets)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [
      /^\/privacy-policy\.html/,
      /^\/\.well-known\//,
      /^\/widgets\//,
      /^\/manifest\.webmanifest/,
    ],
  })
);

// Runtime caching for Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Stale-while-revalidate caching for widget & app metadata JSON
registerRoute(
  ({ url }) => url.pathname.startsWith('/widgets/') && url.pathname.endsWith('.json'),
  new StaleWhileRevalidate({
    cacheName: 'hsp-widget-data-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 16,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Background refresh helper for Periodic Background Sync & Background Sync
async function refreshHspBackgroundData(): Promise<void> {
  const cache = await caches.open('hsp-background-data');
  const endpoints = ['/widgets/active-order-data.json', '/manifest.webmanifest'];
  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (response.ok) {
          await cache.put(endpoint, response.clone());
        }
      } catch {
        // Ignore offline errors during periodic background refresh
      }
    })
  );
}

// Periodic Background Sync: keep HSP delivery summary & widget data fresh automatically
sw.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hsp-delivery-sync' || event.tag.startsWith('hsp-')) {
    event.waitUntil(refreshHspBackgroundData());
  }
});

// One-off Background Sync: refresh state & notify active tabs when network returns
sw.addEventListener('sync', (event) => {
  if (event.tag === 'hsp-order-sync' || event.tag.startsWith('hsp-')) {
    event.waitUntil(
      (async () => {
        await refreshHspBackgroundData();
        const clientList = await sw.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clientList) {
          client.postMessage({ type: 'HSP_BACKGROUND_SYNC', tag: event.tag });
        }
      })()
    );
  }
});

// Push notification listener for order alerts
sw.addEventListener('push', (event) => {
  let title = 'HSP delivery Update';
  let body = 'You have a new delivery or order status update.';
  let url = '/?tab=track';

  if (event.data) {
    try {
      const payload = event.data.json();
      if (typeof payload.title === 'string' && payload.title) title = payload.title;
      if (typeof payload.body === 'string' && payload.body) body = payload.body;
      if (typeof payload.url === 'string' && payload.url) url = payload.url;
    } catch {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url },
    })
  );
});

// Open or focus HSP delivery when user taps a push notification
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const clientList = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await sw.clients.openWindow(targetUrl);
    })()
  );
});

// Allow app to trigger immediate activation on update
sw.addEventListener('message', (event) => {
  if (event.data && (event.data as { type?: string }).type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});
