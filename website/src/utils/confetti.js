/**
 * Tiny dependency-free confetti burst. Call burstConfetti(x, y) with a screen
 * point (e.g. from a click event) — a handful of candy-coloured bits fly out
 * and fall. No canvas, just short-lived absolutely-positioned divs.
 */
const COLORS = ['#1CB0F6', '#FF5DA2', '#FFC93C', '#43C639', '#FF4D6D'];

export function burstConfetti(x, y, count = 16) {
  if (typeof document === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layer = document.createElement('div');
  layer.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:9999';
  document.body.appendChild(layer);

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('div');
    const size = 6 + Math.random() * 6;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 40 + Math.random() * 90;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40; // bias upward
    const rot = (Math.random() * 720 - 360) | 0;
    bit.style.cssText = `
      position:absolute; left:${x}px; top:${y}px; width:${size}px; height:${size}px;
      background:${COLORS[i % COLORS.length]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      opacity:1; will-change:transform,opacity;
      transition:transform .9s cubic-bezier(.2,.7,.3,1), opacity .9s ease;`;
    layer.appendChild(bit);
    // next frame → animate
    requestAnimationFrame(() => {
      bit.style.transform = `translate(${dx}px, ${dy + 160}px) rotate(${rot}deg)`;
      bit.style.opacity = '0';
    });
  }

  setTimeout(() => layer.remove(), 1100);
}
