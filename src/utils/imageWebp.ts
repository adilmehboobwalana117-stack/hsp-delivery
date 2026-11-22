const webpCache = new Map<string, string>();
const inflightConversions = new Map<string, Promise<string>>();

let webpSupportedCache: boolean | null = null;

function isWebpCanvasSupported(): boolean {
  if (webpSupportedCache !== null) return webpSupportedCache;
  if (typeof document === 'undefined') {
    webpSupportedCache = false;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    webpSupportedCache = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupportedCache = false;
  }
  return webpSupportedCache;
}

export function getCachedWebpUrl(src?: string): string | undefined {
  if (!src) return undefined;
  return webpCache.get(src);
}

/**
 * Converts raster images (JPEG/PNG/etc.) to cached client-side WebP data URLs
 * to minimize repeated decodes and reduce memory/bandwidth in Marketplace grids.
 */
export function convertToWebpUrl(src: string, maxWidth = 720, quality = 0.8): Promise<string> {
  if (!src) return Promise.resolve(src);

  const lower = src.toLowerCase();
  if (
    lower.startsWith('data:image/webp') ||
    lower.startsWith('data:image/svg+xml') ||
    lower.endsWith('.svg') ||
    lower.includes('.svg?') ||
    !isWebpCanvasSupported()
  ) {
    return Promise.resolve(src);
  }

  const cached = webpCache.get(src);
  if (cached) return Promise.resolve(cached);

  const existingPromise = inflightConversions.get(src);
  if (existingPromise) return existingPromise;

  const promise = new Promise<string>((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        if (!naturalWidth || !naturalHeight) {
          resolve(src);
          return;
        }
        const scale = Math.min(1, maxWidth / naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const webpDataUrl = canvas.toDataURL('image/webp', quality);
        if (webpDataUrl.startsWith('data:image/webp')) {
          webpCache.set(src, webpDataUrl);
          resolve(webpDataUrl);
        } else {
          resolve(src);
        }
      } catch {
        resolve(src);
      } finally {
        inflightConversions.delete(src);
      }
    };

    img.onerror = () => {
      inflightConversions.delete(src);
      resolve(src);
    };

    img.src = src;
  });

  inflightConversions.set(src, promise);
  return promise;
}
