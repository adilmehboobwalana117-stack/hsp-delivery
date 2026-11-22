// Background-resilient 15-second repeating order alert engine for HSP delivery.
// Combines a Blob Web Worker interval (resists browser background tab throttling),
// PWA Service Worker OS notifications with renotify + vibration (works when minimized),
// PWA home-screen App Badge, and flashing browser tab title.

export type SystemNotificationPermission = NotificationPermission | 'unsupported';

export function getNotificationPermissionState(): SystemNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

interface SystemNotificationOptions {
  title: string;
  body: string;
  tag: string;
  renotify?: boolean;
  requireInteraction?: boolean;
}

/**
 * Fires an OS-level system notification through the active PWA Service Worker
 * (with fallback to window.Notification) so Business Owners, Riders, and Customers
 * are alerted with sound & vibration even when the app is minimized.
 */
export async function showSystemNotification({
  title,
  body,
  tag,
  renotify = true,
  requireInteraction = true,
}: SystemNotificationOptions): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const baseOptions: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
  } = {
    body,
    tag,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    requireInteraction,
    renotify,
    silent: false,
    vibrate: [300, 120, 300, 120, 420],
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, baseOptions);
        return;
      }
    }
  } catch {
    // fallback to standard Notification API below
  }

  try {
    const n = new Notification(title, baseOptions);
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus errors
      }
      n.close();
    };
  } catch {
    // ignore environments where direct Notification constructor is restricted
  }
}

/**
 * Updates the installed PWA home-screen app icon badge count when supported.
 */
export function setPwaAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      nav.setAppBadge(count).catch(() => {});
    } else if (count <= 0 && typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // ignore unsupported badge errors
  }
}

/**
 * Creates a repeating interval backed by an inline Blob Web Worker so timers keep
 * firing every 15 seconds even when the app is minimized or running in a background tab.
 * Returns a cleanup function.
 */
export function startBackgroundRepeatingInterval(
  intervalMs: number,
  onTick: () => void
): () => void {
  let lastTickAt = Date.now();
  let stopped = false;

  const triggerIfDue = (force = false) => {
    if (stopped) return;
    const now = Date.now();
    if (force || now - lastTickAt >= intervalMs - 400) {
      lastTickAt = now;
      onTick();
    }
  };

  let worker: Worker | null = null;
  let workerBlobUrl: string | null = null;
  let fallbackTimer: number | null = null;

  try {
    const workerCode = `
      let timerId = null;
      self.onmessage = function(e) {
        if (e.data && e.data.type === 'start') {
          if (timerId) clearInterval(timerId);
          timerId = setInterval(function() { self.postMessage('tick'); }, e.data.intervalMs);
        } else if (e.data && e.data.type === 'stop') {
          if (timerId) clearInterval(timerId);
          timerId = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
    worker = new Worker(workerBlobUrl);
    worker.onmessage = () => triggerIfDue(false);
    worker.onerror = () => {
      if (!stopped && fallbackTimer === null) {
        fallbackTimer = window.setInterval(() => triggerIfDue(false), intervalMs);
      }
    };
    worker.postMessage({ type: 'start', intervalMs });
  } catch {
    fallbackTimer = window.setInterval(() => triggerIfDue(false), intervalMs);
  }

  // If the OS completely suspended timers while minimized, ring immediately when waking up
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastTickAt >= intervalMs) {
      triggerIfDue(true);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', handleVisibility);
    if (worker) {
      try {
        worker.postMessage({ type: 'stop' });
        worker.terminate();
      } catch {
        // ignore cleanup errors
      }
    }
    if (workerBlobUrl) {
      try {
        URL.revokeObjectURL(workerBlobUrl);
      } catch {
        // ignore
      }
    }
    if (fallbackTimer !== null) {
      window.clearInterval(fallbackTimer);
    }
  };
}
