import React from 'react';

/**
 * Ambient decorative layer — soft drifting candy blobs + twinkles behind the
 * page content. Purely cosmetic, pointer-events-none, respects reduced-motion
 * via the .anim-* classes.
 */
const BLOBS = [
  { c: 'var(--color-primary)',   s: 120, x: '4%',  y: '8%',  d: '0s',   r: '-8deg' },
  { c: 'var(--color-secondary)', s: 150, x: '86%', y: '4%',  d: '1.2s', r: '10deg' },
  { c: 'var(--color-accent)',    s: 80,  x: '78%', y: '62%', d: '.6s',  r: '4deg' },
  { c: 'var(--color-primary)',   s: 64,  x: '12%', y: '70%', d: '2s',   r: '0deg' },
  { c: 'var(--color-secondary)', s: 90,  x: '48%', y: '86%', d: '1.6s', r: '-5deg' },
];
const TWINKLES = [
  { x: '22%', y: '30%', d: '0s' }, { x: '68%', y: '20%', d: '.7s' },
  { x: '40%', y: '58%', d: '1.4s' }, { x: '90%', y: '44%', d: '.4s' },
  { x: '10%', y: '48%', d: '1.1s' }, { x: '60%', y: '78%', d: '1.9s' },
];

export default function CandySky({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden>
      {BLOBS.map((b, i) => (
        <span
          key={`b${i}`}
          className="absolute anim-drift anim-blob opacity-[.18]"
          style={{
            left: b.x, top: b.y, width: b.s, height: b.s, background: b.c,
            animationDelay: b.d, ['--r']: b.r,
          }}
        />
      ))}
      {TWINKLES.map((t, i) => (
        <span
          key={`t${i}`}
          className="absolute h-2 w-2 rounded-full anim-twinkle"
          style={{ left: t.x, top: t.y, background: 'var(--color-accent)', animationDelay: t.d }}
        />
      ))}
    </div>
  );
}
