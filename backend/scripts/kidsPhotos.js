const path = require('path');
const { compressToFile } = require('../utils/imageCompress');

// Generates a simple, cheerful placeholder product photo (SVG → compressed
// WebP on disk) for a kids-clothing item. Returns the "/uploads/products/…"
// web path. Purely illustrative artwork — a garment silhouette on a soft
// coloured card with the product name.

const BG_PAIRS = [
  ['#E4F6FF', '#BDEBFF'], // sky
  ['#FFE6F1', '#FFC7E2'], // pink
  ['#FFF3D6', '#FFE1A6'], // butter
  ['#E7F9E6', '#C7F0C4'], // mint
  ['#EEE9FF', '#D9CCFF'], // lilac
  ['#FFEAE0', '#FFCDB8'], // peach
];

// Rough garment silhouettes keyed by a "shape" tag.
const SHAPES = {
  tee: (c) => `
    <path d="M150 120 L110 100 L70 130 L95 175 L120 160 L120 320 Q120 335 135 335 L265 335 Q280 335 280 320 L280 160 L305 175 L330 130 L290 100 L250 120 Q200 145 150 120 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
    <path d="M150 120 Q200 145 250 120" fill="none" stroke="#3A2C1A" stroke-width="4"/>`,
  onesie: (c) => `
    <path d="M150 110 L112 92 L72 122 L96 168 L120 154 L120 300
      Q120 314 132 320 L150 360 L200 372 L250 360 L268 320 Q280 314 280 300 L280 154 L304 168 L328 122 L288 92 L250 110
      Q200 135 150 110 Z" fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="200" cy="200" r="6" fill="#FFC93C" stroke="#3A2C1A" stroke-width="3"/>
    <circle cx="200" cy="224" r="6" fill="#FFC93C" stroke="#3A2C1A" stroke-width="3"/>`,
  dress: (c) => `
    <path d="M155 115 L118 98 L80 128 L102 170 L128 156 L110 210
      L90 340 Q90 352 104 352 L296 352 Q310 352 310 340 L290 210 L272 156 L298 170 L320 128 L282 98 L245 115
      Q200 138 155 115 Z" fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>`,
  shorts: (c) => `
    <path d="M110 150 L290 150 L288 230 L235 235 L200 175 L165 235 L112 230 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>`,
  pants: (c) => `
    <path d="M120 130 L280 130 L286 200 L268 340 L212 340 L200 210 L188 340 L132 340 L114 200 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>`,
  jacket: (c) => `
    <path d="M150 118 L110 98 L70 128 L96 176 L120 162 L120 330 Q120 344 134 344 L190 344 L200 150 L210 344 L266 344 Q280 344 280 330 L280 162 L304 176 L330 128 L290 98 L250 118 Q200 142 150 118 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
    <line x1="200" y1="150" x2="200" y2="340" stroke="#3A2C1A" stroke-width="4"/>`,
  hoodie: (c) => `
    <path d="M150 120 Q150 80 200 80 Q250 80 250 120 L290 100 L330 130 L305 178 L280 164 L280 330 Q280 344 266 344 L134 344 Q120 344 120 330 L120 164 L95 178 L70 130 L110 100 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
    <path d="M160 118 Q200 100 240 118" fill="none" stroke="#3A2C1A" stroke-width="4"/>`,
  set: (c) => `
    <path d="M150 110 L112 92 L74 122 L98 168 L122 154 L122 250 L278 250 L278 154 L302 168 L326 122 L288 92 L250 110 Q200 132 150 110 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
    <path d="M126 262 L274 262 L268 340 L214 340 L200 280 L186 340 L132 340 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>`,
  cap: (c) => `
    <path d="M110 240 Q110 150 200 150 Q290 150 290 240 L110 240 Z" fill="${c}" stroke="#3A2C1A" stroke-width="6"/>
    <path d="M110 240 L60 262 Q95 280 150 274 L110 240 Z" fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="200" cy="150" r="8" fill="#FF5DA2" stroke="#3A2C1A" stroke-width="3"/>`,
  socks: (c) => `
    <path d="M170 100 L230 100 L230 250 Q230 290 270 290 L300 290 L300 340 L250 340 Q170 340 170 250 Z"
      fill="${c}" stroke="#3A2C1A" stroke-width="6" stroke-linejoin="round"/>`,
};

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

// shape: one of SHAPES keys.  colorName: garment fill colour (best-effort map).
const NAMED = {
  Red: '#FF5A5F', Blue: '#1CB0F6', Pink: '#FF5DA2', Yellow: '#FFC93C', Green: '#43C639',
  White: '#FFFFFF', Grey: '#C7CDD4', Navy: '#243B6B', Mint: '#8FE3C8', Peach: '#FFB59E',
  Lavender: '#C9B7F2', Orange: '#FF9A3C', Mustard: '#E0A82E', Cream: '#FFF3DC', Aqua: '#5CD6C8',
  'Sky Blue': '#7FC9FF', 'Baby Pink': '#FFC7DE', 'Sea Green': '#57C99A', Coral: '#FF7F66',
  Charcoal: '#4A4A4A', Rust: '#C05A2B', Maroon: '#7B2233', Denim: '#4C6B8A',
};

async function makeProductPhoto({ name, shape = 'tee', colorName = 'Blue', variant = 0 }) {
  const seed = hashStr(name + colorName + variant);
  const [b1, b2] = BG_PAIRS[seed % BG_PAIRS.length];
  const garment = NAMED[colorName] || '#1CB0F6';
  const draw = (SHAPES[shape] || SHAPES.tee)(garment);
  const label = String(name).slice(0, 26);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bg)"/>
    <circle cx="${60 + (seed % 40)}" cy="${50 + (seed % 30)}" r="26" fill="#ffffff" opacity="0.35"/>
    <circle cx="${330 - (seed % 30)}" cy="${70 + (seed % 40)}" r="18" fill="#ffffff" opacity="0.3"/>
    <g transform="translate(0,6)">${draw}</g>
    <rect x="40" y="352" width="320" height="34" rx="17" fill="#ffffff" opacity="0.82"/>
    <text x="200" y="374" font-family="Arial, sans-serif" font-size="18" font-weight="700"
      text-anchor="middle" fill="#3A2C1A">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
  </svg>`;

  const { filename } = await compressToFile(Buffer.from(svg));
  return `/uploads/products/${filename}`;
}

module.exports = { makeProductPhoto, SHAPES };
