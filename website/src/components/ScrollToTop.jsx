import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets the window scroll to the top whenever the route (pathname) changes,
 * so opening a product or moving to a new page always starts from the top
 * instead of keeping the previous page's scroll position. An in-page #hash
 * link is left alone so anchor jumps still work.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    // jump instantly — a smooth scroll on nav feels laggy
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}
