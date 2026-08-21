// Barcode/QR label rendering + sizing helpers — ported from DigitZebra's
// Items.jsx barcode label builder so both apps share the same label design,
// field set, and sizing math. Kept framework-agnostic (no MUI, plain JS) so
// it can be consumed by BarcodeLabelPrint.jsx's Tailwind/Radix components.

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

/* ── All supported text fields for a label, in canonical order ── */
export const ALL_LABEL_FIELDS = [
  { key: 'showBusinessName', defaultLabel: 'Business Name' },
  { key: 'showItemName',     defaultLabel: 'Item Name' },
  { key: 'showItemCode',     defaultLabel: 'Item Code' },
  { key: 'showCategory',     defaultLabel: 'Category' },
  { key: 'showSize',         defaultLabel: 'Size' },
  { key: 'showVariant',      defaultLabel: 'Variant' },
  { key: 'showHsn',          defaultLabel: 'HSN Code' },
  { key: 'showMrp',          defaultLabel: 'MRP' },
  { key: 'showSalePrice',    defaultLabel: 'Sale Price' },
  { key: 'showBarcode',      defaultLabel: 'Barcode Strip' },
  { key: 'showBarcodeNumber',defaultLabel: 'Code Number' },
  { key: 'showExtraFields',  defaultLabel: 'Extra Fields' },
];

// size variant → font-size multiplier relative to the label's base fontSize
export const FIELD_SIZE_SCALE = { xs: 0.6, sm: 0.75, md: 1.0, lg: 1.4, xl: 1.9, '2xl': 2.6 };
FIELD_SIZE_SCALE.small = FIELD_SIZE_SCALE.sm;
FIELD_SIZE_SCALE.medium = FIELD_SIZE_SCALE.md;
FIELD_SIZE_SCALE.large = FIELD_SIZE_SCALE.lg;

// Returns the ordered list of field keys, falling back to ALL_LABEL_FIELDS order
export const resolveFieldOrder = (lbl) => {
  const saved = lbl?.fieldOrder;
  if (Array.isArray(saved) && saved.length > 0) {
    const extras = ALL_LABEL_FIELDS.map((f) => f.key).filter((k) => !saved.includes(k));
    return [...saved, ...extras];
  }
  return ALL_LABEL_FIELDS.map((f) => f.key);
};

/* ── 5-zone layout (drag-and-drop placement around the barcode/QR) ──
 * The label is a 3-row CSS grid: Top spans the full width, Middle splits
 * into Left / Center / Right, Bottom spans the full width. Every field
 * (plus the special CODE_KEY placeholder for the barcode/QR image itself)
 * lives in exactly one zone's ordered list — drag moves it between zones
 * and reorders it within a zone.
 */
export const CODE_KEY = '__code__';
export const ZONES = [
  { key: 'top',    label: 'Top' },
  { key: 'left',   label: 'Left' },
  { key: 'center', label: 'Center' },
  { key: 'right',  label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
];

// Default arrangement matching the common "shop name on top, barcode in the
// middle, other details wrapped around it" layout.
export const DEFAULT_ZONE_LAYOUT = {
  top: ['showBusinessName', 'showItemName'],
  left: ['showItemCode', 'showSize'],
  center: [CODE_KEY],
  right: ['showVariant', 'showCategory'],
  bottom: ['showMrp', 'showSalePrice', 'showBarcodeNumber'],
};

const ALL_ZONE_ITEM_KEYS = () => [CODE_KEY, ...ALL_LABEL_FIELDS.filter((f) => f.key !== 'showBarcode').map((f) => f.key)];

// Resolves a saved `lbl.zones` into a complete { top, left, center, right,
// bottom } map covering every placeable key exactly once. Falls back to
// DEFAULT_ZONE_LAYOUT when nothing is saved yet, and migrates a legacy
// `codePosition`/`fieldOrder`-only config (pre-zone-editor) into the zone
// shape so old saved settings still render sensibly instead of resetting.
export function resolveZoneLayout(lbl) {
  const saved = lbl?.zones;
  const known = ALL_ZONE_ITEM_KEYS();

  const hasSavedZones = saved && typeof saved === 'object' && ZONES.some((z) => Array.isArray(saved[z.key]));
  // A pre-zone-editor config is only "legacy" (worth migrating field-by-field)
  // if it actually recorded a customization — a real fieldOrder, or a
  // codePosition that isn't the old shipped default ('top'). A brand-new
  // install with neither just falls through to DEFAULT_ZONE_LAYOUT, since
  // migrating an untouched default would produce a worse arrangement
  // (everything crammed into one zone) than the curated default.
  const hasLegacyCustomization = !hasSavedZones && (
    (Array.isArray(lbl?.fieldOrder) && lbl.fieldOrder.length > 0) ||
    (lbl?.codePosition && lbl.codePosition !== 'top')
  );

  let base;
  if (hasSavedZones) {
    base = {};
    ZONES.forEach((z) => { base[z.key] = Array.isArray(saved[z.key]) ? saved[z.key].filter((k) => known.includes(k)) : []; });
  } else if (hasLegacyCustomization) {
    // Legacy migration: old single-list layout had one global codePosition
    // (top/middle/bottom/left/right) for the barcode and one fieldOrder list
    // for everything else, all in the opposite zone from the code.
    const pos = lbl?.codePosition || 'top';
    const fieldOrder = resolveFieldOrder(lbl).filter((k) => k !== 'showBarcode');
    base = { top: [], left: [], center: [], right: [], bottom: [] };
    const codeZone = pos === 'middle' ? 'center' : pos;
    base[codeZone] = [CODE_KEY];
    const contentZone = (pos === 'left' || pos === 'right')
      ? (pos === 'left' ? 'right' : 'left')
      : (pos === 'top' ? 'bottom' : pos === 'bottom' ? 'top' : 'bottom');
    base[contentZone] = fieldOrder;
  } else {
    base = {};
    ZONES.forEach((z) => { base[z.key] = [...(DEFAULT_ZONE_LAYOUT[z.key] || [])]; });
  }

  // Ensure every known key appears exactly once — drop duplicates, then
  // append any key missing entirely (e.g. a newly-added field, or the code
  // itself if it somehow ended up unplaced) to a sensible default zone.
  const seen = new Set();
  ZONES.forEach((z) => {
    base[z.key] = base[z.key].filter((k) => {
      if (seen.has(k) || !known.includes(k)) return false;
      seen.add(k);
      return true;
    });
  });
  const missing = known.filter((k) => !seen.has(k));
  if (missing.length) {
    missing.forEach((k) => {
      const fallbackZone = k === CODE_KEY ? 'center' : 'bottom';
      base[fallbackZone] = [...base[fallbackZone], k];
    });
  }
  return base;
}

// Which zone currently holds a given key (field key or CODE_KEY).
export function findZoneOf(zoneLayout, key) {
  for (const z of ZONES) {
    if (zoneLayout[z.key]?.includes(key)) return z.key;
  }
  return null;
}

export const LABEL_SIZES = [
  { key: 'standard',  label: '80×40mm (Standard)',        widthMm: 80,  heightMm: 40  },
  { key: '50x40',     label: '50×40mm',                   widthMm: 50,  heightMm: 40  },
  { key: '50x30',     label: '50×30mm',                   widthMm: 50,  heightMm: 30  },
  { key: '50x25',     label: '50×25mm',                   widthMm: 50,  heightMm: 25  },
  // Physically 38mm wide × 25mm tall, but this printer/roll feeds it
  // narrow-edge-first (portrait) rather than the usual long-edge-first —
  // portraitPrint tells getPageStyle() to swap the @page dimensions and
  // rotate the printed content 90° to match, instead of printing landscape.
  { key: '38x25',     label: '38×25mm (Jewellery)',        widthMm: 38,  heightMm: 25, portraitPrint: true },
  { key: '30x20',     label: '30×20mm (Mini)',             widthMm: 30,  heightMm: 20  },
  { key: 'small',     label: '58×30mm (Narrow Thermal)',   widthMm: 58,  heightMm: 30  },
  { key: '60x40',     label: '60×40mm',                   widthMm: 60,  heightMm: 40  },
  { key: '70x40',     label: '70×40mm',                   widthMm: 70,  heightMm: 40  },
  { key: '100x50',    label: '100×50mm (Large)',           widthMm: 100, heightMm: 50  },
  { key: '100x75',    label: '100×75mm (Shipping)',        widthMm: 100, heightMm: 75  },
  { key: '100x150',   label: '100×150mm (Large Shipping)', widthMm: 100, heightMm: 150 },
  { key: 'large',     label: '100×60mm',                  widthMm: 100, heightMm: 60  },
  { key: 'a4',        label: 'A4 Full Page',              widthMm: 210, heightMm: 297 },
];

export const PX_PER_MM = 3.7795;

// Derive all sizing from real mm dimensions.
// contentScale → text/font size only
// codeScale    → barcode strip height, QR square size, bar thickness only
export const buildSizeConfig = (entry, contentScale = 1.0, codeScale = 1.0) => {
  const wPx = entry.widthMm * PX_PER_MM;
  const hPx = entry.heightMm ? entry.heightMm * PX_PER_MM : null;
  const isA4 = entry.key === 'a4';
  const pad = isA4 ? 40 : 6;
  const innerW = wPx - pad * 2;
  const innerH = hPx ? hPx - pad * 2 : null;

  const baseFontPx = Math.max(7, innerW * 0.045) * contentScale;
  const smallFontPx = baseFontPx * 0.82;
  const barcodeH = isA4 ? 70 * codeScale
    : Math.max(12, (innerH ?? innerW * 0.45) * 0.45) * codeScale;
  const shortPx = hPx ? Math.min(wPx, hPx) : wPx;
  const qrPx = isA4 ? 110 * codeScale
    : Math.max(20, shortPx * 0.55) * codeScale;

  return {
    key: entry.key,
    width: `${entry.widthMm}mm`,
    height: entry.heightMm ? `${entry.heightMm}mm` : null,
    widthPx: wPx,
    heightPx: hPx,
    barcodeHeight: barcodeH,
    qrSize: qrPx,
    fontSize: baseFontPx,
    smallFontSize: smallFontPx,
    barWidth: Math.max(1, (innerW / 100) * codeScale),
    portraitPrint: !!entry.portraitPrint,
  };
};

export const CODE_POSITIONS = [
  { value: 'top',    label: 'Code on Top' },
  { value: 'middle', label: 'Code in Middle' },
  { value: 'bottom', label: 'Code on Bottom' },
  { value: 'left',   label: 'Code on Left' },
  { value: 'right',  label: 'Code on Right' },
];
export const CONTENT_ALIGNS = [
  { value: 'left',   label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right',  label: 'Right' },
];
export const BORDER_STYLES = [
  { value: 'solid',  label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'none',   label: 'None' },
];

export const DEFAULT_BARCODE_LABEL = {
  defaultLabelSize: 'standard',
  copies: 1,
  columns: 1,
  contentScale: 1.0,
  codeScale: 1.0,
  codePosition: 'top',
  contentAlign: 'center',
  borderStyle: 'solid',
  backgroundColor: '#ffffff',
  textColor: '#000000',
  showBusinessName: false,
  showItemName: true,
  showItemCode: true,
  showCategory: false,
  showSize: true,
  showVariant: true,
  showHsn: false,
  showMrp: true,
  showSalePrice: true,
  showBarcode: true,
  showBarcodeNumber: true,
  showExtraFields: false,
  fieldOrder: [],
  fieldStyles: {},
  fieldLabels: {},
  // 5-zone drag-and-drop placement (top/left/center/right/bottom) — see
  // resolveZoneLayout(). Left unset by default so a brand-new install
  // resolves straight to DEFAULT_ZONE_LAYOUT rather than duplicating it here.
  zones: null,
};

// Encode a barcode value to a PNG data-URI. Cached — printing N copies of the
// same value only encodes once.
const barcodeCache = new Map();
export function barcodeDataURL(value, { height = 70, fontSize = 13, barWidth = 1.5 } = {}) {
  if (!value) return null;
  const key = `${value}|${height}|${fontSize}|${barWidth}`;
  let src = barcodeCache.get(key);
  if (src) return src;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, String(value), {
      format: 'CODE128', width: barWidth, height, displayValue: true,
      fontSize, margin: 2, background: '#ffffff', lineColor: '#000000',
    });
    src = canvas.toDataURL('image/png');
    barcodeCache.set(key, src);
    return src;
  } catch {
    return null;
  }
}

// Encode a value to a QR PNG data-URI (async). Cached the same way.
const qrCache = new Map();
export async function qrDataURL(value, size = 80) {
  if (!value) return null;
  const key = `${value}|${size}`;
  const cached = qrCache.get(key);
  if (cached) return cached;
  const url = await QRCode.toDataURL(String(value), {
    width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  qrCache.set(key, url);
  return url;
}

// Synchronous cache lookup — null if not yet encoded. Lets QRImage render
// immediately when the value's already cached, instead of always waiting a
// tick for the async qrDataURL() effect to resolve.
export function peekQrDataURL(value, size = 80) {
  if (!value) return null;
  return qrCache.get(`${value}|${size}`) || null;
}

// Coordinates QR draw timing with printing — ported from DigitZebra's
// qrReady.js. react-to-print clones the print node's DOM as soon as
// onBeforePrint's promise resolves; QRImage draws its <img src> inside a
// useEffect (after the initial paint) via the genuinely-async qrDataURL(),
// so a print triggered before that effect has landed would clone a blank/
// placeholder <canvas> instead of the finished QR image. registerQrDraw()
// is called by QRImage whenever it starts drawing a value that isn't
// already cached; waitForQrReady() (passed as onBeforePrint) awaits every
// currently in-flight draw before react-to-print snapshots the DOM.
const inFlightQrDraws = new Set();
export function registerQrDraw(promise) {
  inFlightQrDraws.add(promise);
  const clear = () => inFlightQrDraws.delete(promise);
  promise.then(clear, clear);
}
export async function waitForQrReady() {
  if (!inFlightQrDraws.size) return;
  await Promise.allSettled([...inFlightQrDraws]);
}

// Maps a Common_cart Product record onto DigitZebra's label-item field names
// (mrp/salePrice/itemCode/variant), so the ported label components (which
// read those field names) work unchanged against this app's own Product
// schema (price/discountPrice/SKU/color). `businessName` is threaded in
// separately since it isn't a per-product field.
export function productToLabelItem(p, businessName) {
  const hasDiscount = p.discountPrice != null && p.discountPrice !== '' && Number(p.discountPrice) > 0;
  return {
    id: p.id ?? p._id ?? p.barcode,
    name: p.name,
    itemCode: p.SKU || '',
    barcode: p.barcode || '',
    category: p.category || '',
    size: p.size || '',
    variant: p.color || '',
    mrp: hasDiscount ? (p.price ?? p.costPrice) : '',
    salePrice: hasDiscount ? p.discountPrice : (p.price ?? p.costPrice),
    _businessName: businessName || '',
  };
}
