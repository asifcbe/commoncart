// Barcode/QR label rendering + sizing helpers — ported 1:1 from DigitZebra's
// Items.jsx barcode label builder so both apps share the same label design,
// field set, layout model, and sizing math. Kept framework-agnostic (no MUI,
// plain JS) so it can be consumed by the Tailwind/Radix components in
// components/BarcodeLabel.jsx and components/BarcodeLabelPrintDialog.jsx.
//
// The label layout model is DigitZebra's: a single `codePosition`
// (top/middle/bottom/left/right) places the barcode/QR block, and every text
// field is drawn in `fieldOrder` sequence in the opposite flow position.
// There is NO zone grid here — that was a CommonCart-only divergence and has
// been removed to match DigitZebra exactly.
//
// CommonCart-only extra that is intentionally kept: `printerDpi` / pixelRatio.
// It only changes how many real bitmap pixels the barcode/QR canvas is drawn
// with (for crisp thermal printing) — it never affects on-page layout, so it
// sits orthogonally on top of the ported DigitZebra model.

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
// legacy keys still work
FIELD_SIZE_SCALE.small = FIELD_SIZE_SCALE.sm;
FIELD_SIZE_SCALE.medium = FIELD_SIZE_SCALE.md;
FIELD_SIZE_SCALE.large = FIELD_SIZE_SCALE.lg;

// Returns the ordered list of field keys, falling back to ALL_LABEL_FIELDS order
export const resolveFieldOrder = (lbl) => {
  const saved = lbl?.fieldOrder;
  if (Array.isArray(saved) && saved.length > 0) {
    // Merge: keep saved order, append any new fields not yet in saved list
    const extras = ALL_LABEL_FIELDS.map((f) => f.key).filter((k) => !saved.includes(k));
    return [...saved, ...extras];
  }
  return ALL_LABEL_FIELDS.map((f) => f.key);
};

/* ── 5-zone layout (CommonCart-only editor UI) ──────────────────────────────
 * CommonCart keeps a 5-zone drag-and-drop editor (top / left / center / right /
 * bottom) on the Settings page as the layout picker. The label itself is still
 * rendered by DigitZebra's `codePosition` + `fieldOrder` model (see
 * components/BarcodeLabel.jsx) — `zonesToLayout()` below bridges the two:
 * whichever zone holds CODE_KEY becomes `codePosition`, and the zones flattened
 * top→bottom become `fieldOrder`. So the editor is a friendlier front-end over
 * the same output DigitZebra produces.
 */
export const CODE_KEY = '__code__';
export const ZONES = [
  { key: 'top',    label: 'Top' },
  { key: 'left',   label: 'Left' },
  { key: 'center', label: 'Center' },
  { key: 'right',  label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
];

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
// `codePosition`/`fieldOrder`-only config into the zone shape.
export function resolveZoneLayout(lbl) {
  const saved = lbl?.zones;
  const known = ALL_ZONE_ITEM_KEYS();

  const hasSavedZones = saved && typeof saved === 'object' && ZONES.some((z) => Array.isArray(saved[z.key]));
  const hasLegacyCustomization = !hasSavedZones && (
    (Array.isArray(lbl?.fieldOrder) && lbl.fieldOrder.length > 0) ||
    (lbl?.codePosition && lbl.codePosition !== 'top')
  );

  let base;
  if (hasSavedZones) {
    base = {};
    ZONES.forEach((z) => { base[z.key] = Array.isArray(saved[z.key]) ? saved[z.key].filter((k) => known.includes(k)) : []; });
  } else if (hasLegacyCustomization) {
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

// Bridge: turn a label config's 5-zone layout into DigitZebra's
// { codePosition, fieldOrder } so the DigitZebra renderer reflects zone-editor
// changes. Pass the whole config object (not just `zones`) so a legacy
// codePosition/fieldOrder-only config still migrates via resolveZoneLayout().
//  - codePosition  = zone holding CODE_KEY  (center → 'middle', else the zone key)
//  - fieldOrder    = every field key, zones flattened top→left→center→right→bottom
export function zonesToLayout(lbl) {
  const zl = resolveZoneLayout(lbl);
  let codePosition = 'top';
  for (const z of ZONES) {
    if ((zl[z.key] || []).includes(CODE_KEY)) {
      codePosition = z.key === 'center' ? 'middle' : z.key;
      break;
    }
  }
  const fieldOrder = ZONES.flatMap((z) => (zl[z.key] || []).filter((k) => k !== CODE_KEY));
  return { codePosition, fieldOrder };
}

// Thermal/barcode printer resolutions in common use — CommonCart-only extra
// (DigitZebra has no DPI concept). The browser renders barcode/QR canvases at
// 96 CSS px/inch by default; printing that at a printer's native (higher) dpi
// means the browser must upscale a low-resolution bitmap, which is what
// actually causes blurry/faint bars. Rendering the canvas at the selected
// printer's own dpi from the start (see barcodeDataURL/qrDataURL's pixelRatio)
// fixes that at the source.
export const PRINTER_DPI_OPTIONS = [
  { value: 152, label: '152 dpi (older thermal printers)' },
  { value: 200, label: '200 dpi' },
  { value: 203, label: '203 dpi (most common — SATO SA408, Zebra GK/GX, TSC)' },
  { value: 300, label: '300 dpi (high-resolution thermal)' },
  { value: 600, label: '600 dpi' },
];
export const DEFAULT_PRINTER_DPI = 203;
const CSS_DPI = 96; // browsers render 1 CSS px = 1/96 inch, regardless of the physical device

// How many actual bitmap pixels to draw per CSS px so the barcode/QR canvas
// is genuinely native-resolution at the target printer's dpi.
export function pixelRatioForDpi(dpi) {
  return Math.max(1, (Number(dpi) || DEFAULT_PRINTER_DPI) / CSS_DPI);
}

export const LABEL_SIZES = [
  { key: 'standard',  label: '80×40mm (Standard)',        widthMm: 80,  heightMm: 40  },
  { key: '50x40',     label: '50×40mm',                   widthMm: 50,  heightMm: 40  },
  { key: '50x30',     label: '50×30mm',                   widthMm: 50,  heightMm: 30  },
  { key: '50x25',     label: '50×25mm',                   widthMm: 50,  heightMm: 25  },
  { key: '38x25',     label: '38×25mm (Jewellery)',        widthMm: 38,  heightMm: 25  },
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
// printerDpi   → CommonCart-only; target physical printer resolution. Does NOT
//                change any on-page layout size, only how many real bitmap
//                pixels barcodeDataURL/qrDataURL render per CSS px.
export const buildSizeConfig = (entry, contentScale = 1.0, codeScale = 1.0, printerDpi = DEFAULT_PRINTER_DPI) => {
  const wPx  = entry.widthMm  * PX_PER_MM;
  const hPx  = entry.heightMm ? entry.heightMm * PX_PER_MM : null;
  const isA4 = entry.key === 'a4';
  // Physical labels get a slim content inset (was 6px per side, ~3mm wasted on
  // a 50mm label) — just enough that content isn't flush to the die-cut edge.
  const pad  = isA4 ? 40 : 3;
  const innerW = wPx - pad * 2;
  const innerH = hPx ? hPx - pad * 2 : null;

  // Base font: ~4.5% of label width, minimum 7px — scaled by contentScale only
  const baseFontPx   = Math.max(7, innerW * 0.045) * contentScale;
  const smallFontPx  = baseFontPx * 0.82;
  // Barcode height — scaled by codeScale only
  const barcodeH     = isA4 ? 70 * codeScale
    : Math.max(12, (innerH ?? innerW * 0.45) * 0.45) * codeScale;
  // QR size — scaled by codeScale only
  const shortPx      = hPx ? Math.min(wPx, hPx) : wPx;
  const qrPx         = isA4 ? 110 * codeScale
    : Math.max(20, shortPx * 0.55) * codeScale;

  return {
    key:           entry.key,
    width:         `${entry.widthMm}mm`,
    height:        entry.heightMm ? `${entry.heightMm}mm` : null,
    widthPx:       wPx,
    heightPx:      hPx,
    barcodeHeight: barcodeH,
    qrSize:        qrPx,
    fontSize:      baseFontPx,
    smallFontSize: smallFontPx,
    barWidth:      Math.max(1, (innerW / 100) * codeScale), // bar thickness
    printerDpi:    Number(printerDpi) || DEFAULT_PRINTER_DPI,
    pixelRatio:    pixelRatioForDpi(printerDpi),
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

// Matches DigitZebra's `config.barcodeLabel` (src/ConfigContext.jsx) plus the
// CommonCart-only `printerDpi` and an explicit `codeType` (DigitZebra stores
// the same key; its ConfigContext just omits it from the literal default).
export const DEFAULT_BARCODE_LABEL = {
  codeType: 'barcode',          // 'barcode' | 'qr' — set in Settings, read by the print dialogs
  showItemName: true,
  showItemCode: true,
  showMrp: true,
  showSalePrice: true,
  showBarcode: true,
  showBarcodeNumber: true,
  showBusinessName: false,
  showHsn: false,
  showCategory: false,
  showSize: false,
  showVariant: false,
  showExtraFields: true,
  defaultLabelSize: 'standard',
  // Layout settings
  codePosition: 'top',          // 'top' | 'middle' | 'bottom' | 'left' | 'right'
  contentAlign: 'center',       // 'left' | 'center' | 'right'
  borderStyle: 'solid',         // 'solid' | 'dashed' | 'none'
  backgroundColor: '#ffffff',
  textColor: '#000000',
  copies: 1,
  columns: 1,
  contentScale: 1.0,
  codeScale: 1.0,
  fieldOrder: [],               // ordered list of ALL_LABEL_FIELDS keys (derived from `zones`)
  fieldStyles: {},              // { [fieldKey]: { size, color } }
  fieldLabels: {},              // { [fieldKey]: customPrefixText }
  // CommonCart-only 5-zone editor layout — null until first saved; the Settings
  // page derives codePosition/fieldOrder from this via zonesToLayout().
  zones: null,
  // CommonCart-only — see PRINTER_DPI_OPTIONS.
  printerDpi: DEFAULT_PRINTER_DPI,
};

// Encode a barcode value to a PNG data-URI. Cached — printing N copies of the
// same (value, size, pixelRatio) only encodes once.
//
// Returns { src, cssWidth, cssHeight } (or null). EVERY spatial JsBarcode
// option (bar width, height, font size, margins) is multiplied by the exact
// same `pixelRatio` with NO independent rounding, so the resulting bitmap is
// a clean `pixelRatio`× enlargement of the 1× (DigitZebra) bitmap. Dividing
// canvas.width/height back by `pixelRatio` therefore recovers DigitZebra's
// exact on-page size — the caller pins the <img> to cssWidth so the printed
// preview is pixel-identical to DigitZebra while the underlying bitmap stays
// oversampled for crisp thermal output. (`pixelRatio` defaults to 1, which is
// literally DigitZebra's own path.)
const barcodeCache = new Map();
export function barcodeDataURL(value, { height = 70, fontSize = 13, barWidth = 1.5, pixelRatio = 1 } = {}) {
  if (!value) return null;
  const key = `${value}|${height}|${fontSize}|${barWidth}|${pixelRatio}`;
  const hit = barcodeCache.get(key);
  if (hit) return hit;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, String(value), {
      format: 'CODE128',
      width: barWidth * pixelRatio,
      height: height * pixelRatio,
      displayValue: true,
      fontSize: fontSize * pixelRatio,
      margin: 2 * pixelRatio,
      textMargin: 2 * pixelRatio,
      background: '#ffffff', lineColor: '#000000',
    });
    const entry = {
      src: canvas.toDataURL('image/png'),
      cssWidth: canvas.width / pixelRatio,
      cssHeight: canvas.height / pixelRatio,
    };
    barcodeCache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

// Encode a value to a QR PNG data-URI (async). Cached the same way.
const qrCache = new Map();
export async function qrDataURL(value, size = 80, pixelRatio = 1) {
  if (!value) return null;
  const key = `${value}|${size}|${pixelRatio}`;
  const cached = qrCache.get(key);
  if (cached) return cached;
  const url = await QRCode.toDataURL(String(value), {
    width: Math.round(size * pixelRatio), margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  qrCache.set(key, url);
  return url;
}

// Synchronous cache lookup — null if not yet encoded. Lets QRImage render
// immediately when the value's already cached, instead of waiting a tick for
// the async qrDataURL() effect to resolve.
export function peekQrDataURL(value, size = 80, pixelRatio = 1) {
  if (!value) return null;
  return qrCache.get(`${value}|${size}|${pixelRatio}`) || null;
}

// Coordinates QR draw timing with printing — same purpose as DigitZebra's
// qrReady.js. react-to-print clones the print node's DOM as soon as
// onBeforePrint's promise resolves; QRImage draws its <img src> inside a
// useEffect via the async qrDataURL(), so a print triggered before that
// effect lands would clone a blank <canvas>. registerQrDraw() is called by
// QRImage whenever it starts drawing an un-cached value; waitForQrReady()
// (passed as onBeforePrint) awaits every in-flight draw first.
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

// Maps a CommonCart Product record onto DigitZebra's label-item field names
// (mrp/salePrice/itemCode/variant), so the ported label components (which
// read those field names) work unchanged against this app's own Product
// schema (price/discountPrice/SKU/color). `businessName` is threaded in
// separately since it isn't a per-product field.
export function productToLabelItem(p, businessName) {
  // CommonCart's `price` IS the printed MRP; `discountPrice` (when set and
  // positive) is the selling price. `mrp` is always populated so the label's
  // struck-through "MRP" line shows whenever the field is enabled, matching
  // DigitZebra where mrp/salePrice are independent fields.
  const list = Number(p.price ?? p.costPrice) || 0;
  const disc = (p.discountPrice != null && p.discountPrice !== '' && Number(p.discountPrice) > 0)
    ? Number(p.discountPrice) : null;
  return {
    id: p.id ?? p._id ?? p.barcode,
    name: p.name,
    itemCode: p.SKU || '',
    barcode: p.barcode || '',
    category: p.category || '',
    size: p.size || '',
    variant: p.color || '',
    hsnCode: p.hsnCode || p.hsn || '',
    mrp: list || '',
    salePrice: disc != null ? disc : (list || ''),
    barcodeExtraFields: p.barcodeExtraFields || [],
    _businessName: businessName || '',
  };
}
