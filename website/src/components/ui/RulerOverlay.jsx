import React from 'react';

/**
 * Draws two arrow-tipped dimension lines on top of whatever it wraps — one
 * along the top edge (width) and one along the right edge (height), each
 * spanning only the middle 50% of that edge, centered, with a "Width"/
 * "Height" label plus the measurement near it. Meant to wrap an <img> so a
 * product photo can show its real-world size. Purely client-side: no second
 * image is ever generated or stored for this — the "second photo" in a
 * gallery is just this same <img>, rendered again with this overlay on top.
 *
 * Renders as a single absolutely-positioned SVG covering the wrapped image,
 * with viewBox="0 0 100 100" so it scales with the container regardless of
 * the actual photo's pixel dimensions — every measurement below is in that
 * 0–100 unit space, not real pixels.
 */
export default function RulerOverlay({ widthInches, heightInches, className = '' }) {
  if (!(widthInches > 0) || !(heightInches > 0)) return null;

  const fontSize = 4.5;
  const inset = 4;          // gap from the photo's edge before the line starts
  const lineSpan = 50;      // line covers the middle 50% of the edge
  const halfSpan = lineSpan / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`absolute inset-0 pointer-events-none ${className}`}
      aria-hidden
    >
      <defs>
        <marker id="ruler-arrow-h" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#2B2420" />
        </marker>
        <marker id="ruler-arrow-v" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#2B2420" />
        </marker>
      </defs>

      {/* Top: width line — centered, spanning the middle 50% of the width */}
      <line
        x1={50 - halfSpan} y1={inset} x2={50 + halfSpan} y2={inset}
        stroke="#2B2420" strokeWidth="0.5"
        markerStart="url(#ruler-arrow-h)" markerEnd="url(#ruler-arrow-h)"
      />
      <text
        x="50" y={inset + fontSize * 0.9}
        fontSize={fontSize} fontWeight="700" textAnchor="middle"
        fill="#2B2420" stroke="#ffffff" strokeWidth={fontSize * 0.28} strokeLinejoin="round" paintOrder="stroke"
      >
        Width: {widthInches} in
      </text>

      {/* Right: height line — centered, spanning the middle 50% of the height */}
      <g transform={`translate(${100 - inset},0)`}>
        <line
          x1="0" y1={50 - halfSpan} x2="0" y2={50 + halfSpan}
          stroke="#2B2420" strokeWidth="0.5"
          markerStart="url(#ruler-arrow-v)" markerEnd="url(#ruler-arrow-v)"
        />
        <g transform={`rotate(-90 0 50)`}>
          {/* Rotating -90° around (0,50): text drawn at (0,50) stays ON the
              pivot after rotation, so it lands centered on the line — the
              y-offset below is applied BEFORE rotation, which after a -90°
              turn becomes a horizontal shift (left, away from the photo). */}
          <text
            x={-fontSize * 0.5} y="50"
            fontSize={fontSize} fontWeight="700" textAnchor="middle"
            fill="#2B2420" stroke="#ffffff" strokeWidth={fontSize * 0.28} strokeLinejoin="round" paintOrder="stroke"
          >
            Height: {heightInches} in
          </text>
        </g>
      </g>
    </svg>
  );
}
