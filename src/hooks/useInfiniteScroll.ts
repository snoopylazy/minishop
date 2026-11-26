import { useEffect, useRef, useCallback } from 'react';

/**
 * Calls `onLoadMore` whenever the sentinel element (returned ref) enters the viewport.
 * Pass `hasMore=false` to stop observing.
 */
export function useInfiniteScroll(onLoadMore: () => void, hasMore: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const stableLoad = useRef(onLoadMore);
  stableLoad.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          stableLoad.current();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  return sentinelRef;
}
