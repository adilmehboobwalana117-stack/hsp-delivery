import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Automatic PWA Update Listener for Production Builds (and clean up any stale dev SW)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let hasTriggeredUpdate = false;
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController && !hasTriggeredUpdate) return;
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        hasTriggeredUpdate = true;
        void updateSW(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        const checkForUpdate = () => {
          registration.update().catch(() => undefined);
        };
        window.setInterval(checkForUpdate, 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForUpdate();
          }
        });
        window.addEventListener('focus', checkForUpdate);
        window.addEventListener('online', checkForUpdate);

        // Register Periodic Background Sync when browser supports it
        const regWithPeriodic = registration as ServiceWorkerRegistration & {
          periodicSync?: {
            register: (tag: string, options: { minInterval: number }) => Promise<void>;
          };
        };
        if (regWithPeriodic.periodicSync && 'permissions' in navigator) {
          navigator.permissions
            .query({ name: 'periodic-background-sync' as PermissionName })
            .then((status) => {
              if (status.state === 'granted') {
                return regWithPeriodic.periodicSync?.register('hsp-delivery-sync', {
                  minInterval: 12 * 60 * 60 * 1000,
                });
              }
              return undefined;
            })
            .catch(() => undefined);
        }
      },
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((reg) => {
          void reg.unregister();
        });
      })
      .catch(() => undefined);
  }
}

// Tier 1 Google Maps Platform Quota Defense (Demo Key)
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
