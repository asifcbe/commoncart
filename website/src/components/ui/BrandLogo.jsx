import React from 'react';

/**
 * In-app "T & J" candy wordmark, approximating the Tom & Jerry Kids Wear
 * artwork: a blue tee-shaped T (with hanger hook + cheese buttons), a pink
 * J (with bow), and a heart for the "&". Pure SVG — no image asset needed.
 *
 * Props:
 *   size      — height in px (default 40)
 *   animated  — gentle idle motion on the pieces (default true)
 *   showText  — render the "Tom & Jerry" / "Kids Wear" text beside it
 */
export default function BrandLogo({ size = 40, animated = true, showText = false, className = '' }) {
  const a = (cls) => (animated ? cls : '');
  return (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <svg
        width={size * 1.9}
        height={size}
        viewBox="0 0 190 100"
        role="img"
        aria-label="Tom & Jerry Kids Wear"
        className="shrink-0 overflow-visible"
      >
        <defs>
          <linearGradient id="tj-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5CCBFF" />
            <stop offset="1" stopColor="#1CB0F6" />
          </linearGradient>
          <linearGradient id="tj-pink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF87BE" />
            <stop offset="1" stopColor="#FF5DA2" />
          </linearGradient>
          <linearGradient id="tj-yellow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD866" />
            <stop offset="1" stopColor="#FFC93C" />
          </linearGradient>
        </defs>

        {/* ── T : a little tee on a hanger ── */}
        <g className={a('anim-bob')} style={{ transformOrigin: '46px 55px' }}>
          {/* hanger hook */}
          <path
            d="M40 22c0-6 5-10 10-10s10 4 10 9"
            fill="none"
            stroke="url(#tj-yellow)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* tee body forming a T */}
          <path
            d="M18 34c6-8 14-10 20-10h20c6 0 14 2 20 10l-14 12v34a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V46L18 34z"
            fill="url(#tj-blue)"
            stroke="#3A2C1A"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* stitch dashes */}
          <path
            d="M24 36c4-6 11-8 16-8h16c5 0 12 2 16 8M46 30v52"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeDasharray="3 4"
            strokeLinecap="round"
          />
          {/* cheese buttons */}
          <circle cx="46" cy="44" r="4.5" fill="url(#tj-yellow)" stroke="#3A2C1A" strokeWidth="2" />
          <circle cx="46" cy="56" r="4.5" fill="url(#tj-yellow)" stroke="#3A2C1A" strokeWidth="2" />
        </g>

        {/* ── & : a heart ── */}
        <path
          className={a('anim-bob')}
          style={{ animationDelay: '.4s', transformOrigin: '95px 50px' }}
          d="M95 62c-10-7-16-13-16-21a9 9 0 0 1 16-5 9 9 0 0 1 16 5c0 8-6 14-16 21z"
          fill="#FF4D6D"
          stroke="#3A2C1A"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* ── J : pink letter with a bow ── */}
        <g className={a('anim-bob')} style={{ animationDelay: '.8s', transformOrigin: '150px 55px' }}>
          <path
            d="M132 26h40M152 26v40a14 14 0 0 1-28 0"
            fill="none"
            stroke="url(#tj-pink)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M132 26h40M152 26v40a14 14 0 0 1-28 0"
            fill="none"
            stroke="#3A2C1A"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0"
          />
          {/* bow */}
          <g className={a('anim-wiggle')} style={{ transformOrigin: '152px 20px' }}>
            <path d="M152 20l-14-8v16zM152 20l14-8v16z" fill="url(#tj-pink)" stroke="#3A2C1A" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx="152" cy="20" r="4" fill="#FF87BE" stroke="#3A2C1A" strokeWidth="2.5" />
          </g>
        </g>
      </svg>

      {showText && (
        <span className="leading-none whitespace-nowrap">
          <span className="block font-semibold text-lg sm:text-xl" style={{ color: 'var(--color-ink)', fontFamily: "'Fraunces', Georgia, serif" }}>
            Tom <span style={{ color: 'var(--color-primary)' }}>&amp;</span> Jerry
          </span>
          <span className="block text-[10px] sm:text-[11px] font-medium tracking-[0.3em] uppercase mt-0.5" style={{ color: 'var(--color-ink-soft)' }}>
            Kids Wear
          </span>
        </span>
      )}
    </span>
  );
}
