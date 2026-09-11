const { compressToFile } = require('../utils/imageCompress');

// Generates a cheerful illustrative card (SVG → compressed WebP under
// uploads/categories/) for a product category or sub-category. Same spirit as
// kidsPhotos.js — a soft pastel gradient, a couple of playful shapes, and the
// name on a rounded label. Returns the "/uploads/categories/…" web path.

const BG_PAIRS = [
  ['#E4F6FF', '#BDEBFF'], ['#FFE6F1', '#FFC7E2'], ['#FFF3D6', '#FFE1A6'],
  ['#E7F9E6', '#C7F0C4'], ['#EEE9FF', '#D9CCFF'], ['#FFEAE0', '#FFCDB8'],
  ['#E0F7F4', '#BEEDE4'], ['#F1F0E4', '#E2DDC7'],
];
const ACCENTS = ['#1CB0F6', '#FF5DA2', '#FFC93C', '#43C639', '#FF9A3C', '#9B7BF2', '#57C99A', '#FF7F66'];

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Wrap a label into up to 2 lines of ~14 chars for the card.
function wrap(text) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 14 && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  if (!lines.length) lines.push(String(text).slice(0, 14));
  return lines.slice(0, 2);
}

/**
 * makeCategoryPhoto({ name, kind })
 *   name  — category / sub-category label to print on the card
 *   kind  — 'category' (bolder, bigger shapes) | 'sub' (lighter)  [cosmetic only]
 */
async function makeCategoryPhoto({ name, kind = 'category' }) {
  const seed = hashStr(name + kind);
  const [b1, b2] = BG_PAIRS[seed % BG_PAIRS.length];
  const accent = ACCENTS[seed % ACCENTS.length];
  const accent2 = ACCENTS[(seed >> 3) % ACCENTS.length];
  const lines = wrap(name);
  const big = kind === 'category';

  // A little hanger + tag motif, plus scattered dots — purely decorative.
  const motif = `
    <g transform="translate(200 ${big ? 150 : 158}) rotate(${((seed % 14) - 7)})" opacity="0.92">
      <path d="M0 -46 q0 -20 22 -20 q22 0 22 18" fill="none" stroke="#3A2C1A" stroke-width="6" stroke-linecap="round"/>
      <path d="M-70 8 L0 -34 L70 8 Q78 14 66 20 L-66 20 Q-78 14 -70 8 Z"
        fill="${accent}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="0" cy="-30" r="6" fill="#fff" stroke="#3A2C1A" stroke-width="3"/>
    </g>
    <circle cx="${70 + (seed % 30)}" cy="${60 + (seed % 24)}" r="16" fill="${accent2}" opacity="0.6"/>
    <circle cx="${320 - (seed % 26)}" cy="${90 + (seed % 30)}" r="11" fill="#ffffff" opacity="0.7"/>
    <circle cx="${300 - (seed % 40)}" cy="${300 - (seed % 30)}" r="14" fill="${accent}" opacity="0.4"/>`;

  const labelH = lines.length === 2 ? 78 : 50;
  const labelY = 400 - labelH - 26;
  const textY1 = lines.length === 2 ? labelY + 32 : labelY + 33;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bg)"/>
    ${motif}
    <rect x="34" y="${labelY}" width="332" height="${labelH}" rx="${labelH / 2 > 26 ? 26 : labelH / 2}" fill="#ffffff" opacity="0.9"/>
    ${lines.map((ln, i) => `<text x="200" y="${textY1 + i * 30}" font-family="Arial, sans-serif" font-size="${big ? 24 : 21}" font-weight="800" text-anchor="middle" fill="#3A2C1A">${esc(ln)}</text>`).join('')}
  </svg>`;

  const { filename } = await compressToFile(Buffer.from(svg), 'categories');
  return `/uploads/categories/${filename}`;
}

module.exports = { makeCategoryPhoto };
