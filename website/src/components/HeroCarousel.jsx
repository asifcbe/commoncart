import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import Img from './ui/Img';

const AUTOPLAY_MS = 5000;

// Slide `linkUrl` may be a relative in-app path ("/products?category=X") or
// an absolute URL — relative ones use client-side routing, absolute ones a
// plain anchor so external links actually navigate away.
function SlideLink({ linkUrl, className, style, children }) {
  if (!linkUrl) return <div className={className} style={style}>{children}</div>;
  const isAbsolute = /^https?:\/\//i.test(linkUrl);
  if (isAbsolute) {
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {children}
      </a>
    );
  }
  return <Link to={linkUrl} className={className} style={style}>{children}</Link>;
}

export default function HeroCarousel() {
  const [slides, setSlides] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/settings/carousel');
        if (alive) setSlides(data.config?.slides || []);
      } catch {
        /* no carousel configured — render nothing */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const goTo = useCallback((i) => {
    setIndex((prev) => {
      const n = slides.length;
      if (!n) return prev;
      return (i + n) % n;
    });
  }, [slides.length]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Autoplay — pauses on hover/touch, resets whenever the slide changes.
  useEffect(() => {
    if (slides.length <= 1) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!pausedRef.current) next();
    }, AUTOPLAY_MS);
    return () => clearTimeout(timerRef.current);
  }, [index, slides.length, next]);

  if (loading || slides.length === 0) return null;

  return (
    <div
      className="card relative overflow-hidden anim-rise"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div className="relative aspect-[16/7] sm:aspect-[21/8] w-full overflow-hidden" style={{ background: 'var(--color-primary-light)' }}>
        {slides.map((s, i) => (
          <SlideLink
            key={s.id}
            linkUrl={s.linkUrl}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? 'auto' : 'none' }}
          >
            <Img src={s.image} alt={s.title || ''} className="h-full w-full" imgClassName="h-full w-full object-cover" iconSize={36} />
            {(s.title || s.description) && (
              <div
                className="absolute inset-0 flex flex-col justify-end p-5 sm:p-10"
                style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 55%)' }}
              >
                {s.title && (
                  <p className="text-xl sm:text-3xl font-semibold text-white max-w-xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                    {s.title}
                  </p>
                )}
                {s.description && (
                  <p className="mt-1.5 text-sm sm:text-base text-white/90 max-w-lg">{s.description}</p>
                )}
              </div>
            )}
          </SlideLink>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white/85 hover:bg-white flex items-center justify-center shadow"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white/85 hover:bg-white flex items-center justify-center shadow"
          >
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="h-2 rounded-full transition-all"
                style={{ width: i === index ? 20 : 8, background: i === index ? '#fff' : 'rgba(255,255,255,.55)' }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
