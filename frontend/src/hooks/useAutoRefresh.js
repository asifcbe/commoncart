import { useEffect, useRef } from 'react';

/**
 * Periodically re-runs `callback` so pages stay fresh when multiple users
 * edit data at the same time.
 *
 * - Fires every `intervalMs` (default 30s) while the tab is visible.
 * - Skips ticks while the tab is hidden (no wasted requests), and refreshes
 *   immediately when the tab becomes visible again.
 * - `deps` lets the caller restart the timer when filters/page change so the
 *   refresh always uses the latest parameters.
 *
 * Usage:
 *   useAutoRefresh(fetchData, 30000, [search, page]);
 */
export default function useAutoRefresh(callback, intervalMs = 30000, deps = []) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (intervalMs <= 0) return undefined;

    const tick = () => {
      // Only refresh when the tab is actually visible
      if (document.visibilityState === 'visible') {
        savedCallback.current?.();
      }
    };

    const id = setInterval(tick, intervalMs);

    // Refresh as soon as the user returns to the tab
    const onVisible = () => {
      if (document.visibilityState === 'visible') savedCallback.current?.();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
