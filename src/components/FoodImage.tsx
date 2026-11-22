import { useEffect, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { convertToWebpUrl, getCachedWebpUrl } from '../utils/imageWebp';

interface FoodImageProps {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function FoodImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  priority = false,
}: FoodImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(priority);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() =>
    getCachedWebpUrl(src)
  );

  // Lazy trigger via IntersectionObserver so off-screen cards don't decode/convert early
  useEffect(() => {
    setFailed(false);
    if (priority) {
      setInView(true);
      return;
    }
    if (!src) return;
    if (getCachedWebpUrl(src)) {
      setInView(true);
      return;
    }

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [src, priority]);

  // Convert raster images into cached WebP data URLs once visible
  useEffect(() => {
    if (!inView || !src) return;
    let cancelled = false;
    const cached = getCachedWebpUrl(src);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }
    convertToWebpUrl(src).then((webpOrOriginal) => {
      if (!cancelled) {
        setResolvedSrc(webpOrOriginal);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inView, src]);

  if (!src || failed) {
    return (
      <div
        ref={containerRef}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-amber-950/40 text-zinc-300 p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Store className="w-7 h-7 text-yellow-400/80 mb-1.5" />
        <span className="text-xs font-bold text-amber-200 line-clamp-2 max-w-[160px]">{alt}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-zinc-900">
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={className}
        />
      ) : (
        <div
          className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-950 to-amber-950/20 animate-pulse"
          aria-label={alt}
        />
      )}
    </div>
  );
}
