const AppSettings = require('../models/AppSettings');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { deleteProductImageFiles } = require('../utils/productImages');

const CREDIT_KEY = 'CREDIT_CONFIG';
// pointsPerAmount/perRupees are the admin-facing "earn N points per ₹M" pair;
// rupeesPerPoint is the derived single ratio the earning formula actually
// uses (see salesController.processStoreSale). Old configs saved before
// pointsPerAmount/perRupees existed only have rupeesPerPoint — getCreditConfig
// backfills the pair for display so the settings form always has both.
const DEFAULT_CREDIT = { pointsPerAmount: 1, perRupees: 1000, rupeesPerPoint: 1000, pointValue: 1 };

const BUSINESS_KEY = 'BUSINESS_CONFIG';
const DEFAULT_BUSINESS = {
  businessName: 'CommonCart Store',
  addressLine: '',
  phone: '',
  email: '',
  gstin: '',                 // shop's GST identification number
  gstEnabled: false,         // whether GST is shown/charged on bills
  gstPercent: 18,            // default GST rate %
  gstInclusive: true,        // true = prices already include GST; false = GST added on top
  defaultHsnCode: '',        // pre-filled into new Product/Purchase HSN fields; no fallback at sale time
  stateName: '',
  footerNote: 'Thank you for shopping!',
};

// Managed category catalog. Shape: { categories: [{ name, subCategories: [string] }] }
// Products may only be created against categories/sub-categories defined here.
const CATEGORY_KEY = 'CATEGORY_CONFIG';
const DEFAULT_CATEGORIES = { categories: [] };

// Storefront homepage hero carousel. Shape: { slides: [{ id, image, title, description, linkUrl, order }] }
const CAROUSEL_KEY = 'CAROUSEL_CONFIG';
const DEFAULT_CAROUSEL = { slides: [] };

// Auto-delete out-of-stock products. enabled + days (after continuously
// out of stock) before the product is permanently removed.
const AUTO_DELETE_KEY = 'AUTO_DELETE_CONFIG';
const DEFAULT_AUTO_DELETE = { enabled: false, days: 3 };

// Managed master lists of variants (colors) and sizes. Products/purchases may
// only use values defined here (the UI also allows adding new ones inline).
const VARIANT_KEY = 'VARIANT_CONFIG';
const DEFAULT_VARIANTS = { variants: [], sizes: [], variantSelectorEnabled: false };

// Default barcode-label printing preferences applied when a print dialog opens.
// Shape matches DigitZebra's `config.barcodeLabel` (ported UI in
// BarcodeLabelPrint.jsx) — free-form JSON (see AppSettings.value: Mixed),
// not a fixed schema, since the label builder adds new per-field style/order
// keys over time and both sides must be able to add fields without a backend
// migration.
const LABEL_PRINT_KEY = 'LABEL_PRINT_CONFIG';
// Label design + per-print-job defaults. Rendering is DigitZebra's
// `codePosition` + `fieldOrder` model; CommonCart keeps a 5-zone editor UI on
// the Settings page whose `zones` map the frontend bridges to
// codePosition/fieldOrder (zonesToLayout). `printerDpi` and `codeType` are
// CommonCart extras. Free-form JSON (AppSettings.value is Mixed) — the label
// builder adds keys over time without a backend migration.
const DEFAULT_LABEL_PRINT = {
  codeType: 'barcode',      // 'barcode' | 'qr' — per-dialog default (dialogs also have a toggle)
  defaultLabelSize: 'standard', // LABEL_SIZES key (see frontend LABEL_SIZES)
  copies: 1,
  columns: 1,
  contentScale: 1.0,
  codeScale: 1.0,
  // Thickens only the barcode's bars (not its footprint) so it prints darker
  // on thermal printers. 1.0 = normal; higher = bolder bars.
  barcodeDarkness: 1.0,
  // Enlarge only the price number (not caption or ₹) — MRP and Sale Price
  // independently. 1.0 = no change. Per-field overrides live in fieldStyles.
  mrpScale: 1.0,
  salePriceScale: 1.0,
  // Fraction (0.3–1) of its zone the barcode strip occupies — narrows it
  // without changing bar thickness/height.
  barcodeWidth: 1.0,
  // Inner label inset per side, in mm (0–8).
  labelPadding: 0.8,
  // CommonCart-only. Target printer resolution in dpi (152/200/203/300/600 —
  // see frontend PRINTER_DPI_OPTIONS). Barcode/QR images render at this
  // resolution instead of the browser's fixed 96dpi default so they print
  // crisp on real hardware. Does not affect layout.
  printerDpi: 203,
  codePosition: 'top',      // 'top' | 'middle' | 'bottom' | 'left' | 'right'
  contentAlign: 'center',   // 'left' | 'center' | 'right'
  borderStyle: 'solid',     // 'solid' | 'dashed' | 'none'
  backgroundColor: '#ffffff',
  textColor: '#000000',
  // Field visibility — matches ALL_LABEL_FIELDS keys in the frontend and
  // DigitZebra's ConfigContext defaults.
  showItemName: true,
  showItemCode: true,
  showMrp: true,
  showSalePrice: true,
  showBarcode: true,
  // Opt-in — the barcode/QR image already carries the scannable value; the
  // human-readable number is only drawn (wherever its chip is placed) when
  // this field is explicitly turned on.
  showBarcodeNumber: false,
  showBusinessName: false,
  showHsn: false,
  showCategory: false,
  showSize: false,
  showVariant: false,
  showExtraFields: true,
  fieldOrder: [],           // ordered list of ALL_LABEL_FIELDS keys (derived from `zones` on the frontend)
  fieldStyles: {},          // { [fieldKey]: { size, color, align } }
  fieldLabels: {},          // { [fieldKey]: customPrefixText }
  // 5-zone drag-and-drop placement (top/left/center/right/bottom + '__code__').
  // null until first saved; the frontend derives codePosition/fieldOrder from it.
  zones: null,
};

// Bill / receipt print formatting (POS + purchase bills).
const BILL_PRINT_KEY = 'BILL_PRINT_CONFIG';
const DEFAULT_BILL_PRINT = {
  paperSize: '80mm',        // '58mm' | '80mm' | 'A4' | 'A5' | 'custom'
  customWidthMm: 80,        // roll width when paperSize === 'custom'
};

// App-wide date display format — applies everywhere a date is shown (lists,
// detail views, bill/receipt prints, exports), not just bills.
const DISPLAY_KEY = 'DISPLAY_CONFIG';
const VALID_DATE_FORMATS = ['DD/MM/YYYY', 'SYSTEM'];
const DEFAULT_DISPLAY = { dateFormat: 'DD/MM/YYYY' };

// Barcode counter — sequential barcodes starting from a configured number
const BARCODE_KEY = 'BARCODE_CONFIG';
const DEFAULT_BARCODE_CONFIG = { startFrom: 100000 };

// Admin-configurable payment modes offered at POS checkout (and for split
// payments). `key` is the value stored on SaleTransaction.paymentMethod /
// splitPayments[].method; `label` is what's shown on buttons/receipts.
// Seeded with the original hardcoded set so existing data keeps working.
const PAYMENT_MODES_KEY = 'PAYMENT_MODES_CONFIG';
const DEFAULT_PAYMENT_MODES = {
  modes: [
    { key: 'CASH', label: 'Cash' },
    { key: 'CARD', label: 'Card' },
    { key: 'MOBILE', label: 'Mobile' },
    { key: 'OTHER', label: 'Other' },
  ],
};

// Document numbering formats — one {format, prefix, digits} config per document
// type, keyed by the same prefix generateInvoiceNumber() uses as its counter
// namespace (INV/PUR/CN/RN/ORD). Replaces the old single global INVOICE_CONFIG.
// format options:
//   'YYMMNNNN'         – 26060001  (current default)
//   'YYYYMMNNNN'       – 202606001
//   'SEQUENTIAL'       – 000001  (pure 6-digit global counter)
//   'PREFIX-DATE-NNN'  – INV-20260601-001
const DOC_NUMBERING_KEY = 'DOC_NUMBERING_CONFIG';
const DOC_TYPES = ['INV', 'PUR', 'CN', 'RN', 'ORD'];
const DOC_TYPE_LABELS = {
  INV: 'Invoice (Sale)',
  PUR: 'Purchase',
  CN: 'Credit Note',
  RN: 'Replacement Note',
  ORD: 'Order (Web)',
};
const docDefault = (prefix) => ({ format: 'YYMMNNNN', prefix, digits: 4 });
const DEFAULT_DOC_NUMBERING = DOC_TYPES.reduce((acc, t) => {
  acc[t] = docDefault(t);
  return acc;
}, {});
// Legacy single-config key, kept only for reading pre-existing installs' saved
// invoice format on first migration to the per-type config below.
const INVOICE_CONFIG_KEY = 'INVOICE_CONFIG';
const BARCODE_COUNTER_KEY = 'BARCODE_COUNTER';

exports.getBarcodeConfig = async (_req, res) => {
  try {
    const config = await AppSettings.get(BARCODE_KEY, DEFAULT_BARCODE_CONFIG);
    const counter = await AppSettings.get(BARCODE_COUNTER_KEY, null);
    const nextBarcode = counter !== null ? counter : config.startFrom;
    res.json({ config: { ...DEFAULT_BARCODE_CONFIG, ...config }, nextBarcode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateBarcodeConfig = async (req, res) => {
  try {
    const startFrom = Math.max(100000, Math.min(999999, Math.floor(Number(req.body?.startFrom) || DEFAULT_BARCODE_CONFIG.startFrom)));
    const config = { startFrom };
    await AppSettings.set(BARCODE_KEY, config);
    // Reset the counter to the new start value
    await AppSettings.set(BARCODE_COUNTER_KEY, startFrom);
    res.json({ config, nextBarcode: startFrom });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reserve N sequential barcodes atomically and return them.
// Used by the purchase form so the frontend can display/print real barcodes before saving.
exports.reserveBarcodes = async (req, res) => {
  try {
    const n = Math.max(1, Math.min(500, Number(req.body?.count) || 1));
    const config = await AppSettings.get(BARCODE_KEY, DEFAULT_BARCODE_CONFIG);
    const startFrom = Number(config?.startFrom ?? 100000);

    // Ensure counter doc exists
    await AppSettings.findOneAndUpdate(
      { key: BARCODE_COUNTER_KEY },
      { $setOnInsert: { value: startFrom } },
      { upsert: true }
    );

    // Atomically advance counter by n and get the pre-increment value
    const doc = await AppSettings.findOneAndUpdate(
      { key: BARCODE_COUNTER_KEY },
      { $inc: { value: n } },
      { new: false }  // pre-increment = first barcode in the reserved block
    );

    const first = doc ? Number(doc.value) : startFrom;
    const barcodes = Array.from({ length: n }, (_, i) => String(first + i));
    res.json({ barcodes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const VALID_DOC_FORMATS = ['YYMMNNNN', 'YYYYMMNNNN', 'SEQUENTIAL', 'PREFIX-DATE-NNN'];

function normalizeDocConfig(raw, fallbackPrefix) {
  const b = raw || {};
  const format = VALID_DOC_FORMATS.includes(b.format) ? b.format : 'YYMMNNNN';
  const prefix = (b.prefix ?? fallbackPrefix).toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || fallbackPrefix;
  const digits = [4, 6].includes(Number(b.digits)) ? Number(b.digits) : 4;
  return { format, prefix, digits };
}

// Read the full per-document-type numbering config, migrating a legacy
// single-type INVOICE_CONFIG (pre-multi-type installs) into the INV slot.
async function readDocNumberingConfig() {
  const saved = await AppSettings.get(DOC_NUMBERING_KEY, null);
  if (saved) {
    const config = {};
    for (const t of DOC_TYPES) config[t] = normalizeDocConfig(saved[t], t);
    return config;
  }
  const legacy = await AppSettings.get(INVOICE_CONFIG_KEY, null);
  const config = { ...DEFAULT_DOC_NUMBERING };
  if (legacy) config.INV = normalizeDocConfig(legacy, 'INV');
  return config;
}

exports.getDocNumberingConfig = async (_req, res) => {
  try {
    const config = await readDocNumberingConfig();
    res.json({ config, labels: DOC_TYPE_LABELS });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateDocNumberingConfig = async (req, res) => {
  try {
    const docType = (req.body?.docType || '').toString().toUpperCase();
    if (!DOC_TYPES.includes(docType)) return res.status(400).json({ message: `docType must be one of ${DOC_TYPES.join(', ')}` });

    const current = await readDocNumberingConfig();
    current[docType] = normalizeDocConfig(req.body, docType);
    await AppSettings.set(DOC_NUMBERING_KEY, current);
    res.json({ config: current });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Legacy endpoints — kept so any cached frontend build still works; both
// operate on the INV slot of the new per-type config.
exports.getInvoiceConfig = async (_req, res) => {
  try {
    const config = await readDocNumberingConfig();
    res.json({ config: config.INV });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateInvoiceConfig = async (req, res) => {
  try {
    const current = await readDocNumberingConfig();
    current.INV = normalizeDocConfig(req.body, 'INV');
    await AppSettings.set(DOC_NUMBERING_KEY, current);
    res.json({ config: current.INV });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const AGING_KEY = 'PRICE_AGING_CONFIG';

// Price Aging measures a product's age from its PURCHASE date
// (`agingBaseDate`, stamped when the unit is created from a purchase), not
// from when the DB row was inserted. Older products with no agingBaseDate
// fall back to `createdAt`.
const agingAgeDays = (product, now = new Date()) => {
  const from = product.agingBaseDate || product.createdAt;
  return (now - new Date(from)) / 86400000;
};
// steps: array of { days, percent, label }
// enabled: bool — whether the auto-reduce job is active
const DEFAULT_AGING = {
  enabled: false,
  steps: [
    { days: 30,  label: 'Fresh (30 days)',    percent: 0 },
    { days: 60,  label: 'Slow-moving (60 days)', percent: 5 },
    { days: 90,  label: 'Clearance (90 days)',   percent: 10 },
    { days: 120, label: 'Heavy Discount (120 days)', percent: 15 },
    { days: 180, label: 'Half-Year Sale (180 days)', percent: 20 },
    { days: 365, label: 'Annual Clearance (1 Year)', percent: 30 },
    { days: 730, label: 'Deep Clearance (2+ Years)', percent: 50 },
  ],
};

exports.getCreditConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(CREDIT_KEY, DEFAULT_CREDIT);
    // Backfill pointsPerAmount/perRupees for configs saved before those
    // fields existed — derive "1 point per rupeesPerPoint rupees" as the pair.
    const config = saved.pointsPerAmount != null
      ? saved
      : { ...saved, pointsPerAmount: 1, perRupees: saved.rupeesPerPoint };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateCreditConfig = async (req, res) => {
  try {
    const { pointsPerAmount, perRupees, pointValue } = req.body;
    if (!pointsPerAmount || pointsPerAmount < 0.01) return res.status(400).json({ message: 'pointsPerAmount must be >= 0.01' });
    if (!perRupees || perRupees < 1) return res.status(400).json({ message: 'perRupees must be >= 1' });
    if (!pointValue || pointValue < 0.01) return res.status(400).json({ message: 'pointValue must be >= 0.01' });
    const config = {
      // Admin enters "earn N points per ₹M spent" — the earning formula
      // elsewhere (processStoreSale) still reads a single rupeesPerPoint
      // ratio (amount / rupeesPerPoint = points), so it's derived here once
      // and stored alongside the two input numbers (kept so the settings
      // form can show back exactly what was typed, not a rounded derivative).
      pointsPerAmount: Number(pointsPerAmount),
      perRupees: Number(perRupees),
      rupeesPerPoint: Number(perRupees) / Number(pointsPerAmount),
      pointValue: Number(pointValue),
    };
    await AppSettings.set(CREDIT_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Business / GST config ───────────────────────────────────

exports.getBusinessConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(BUSINESS_KEY, {});
    // Merge over defaults so newly-added fields always have a value
    const config = { ...DEFAULT_BUSINESS, ...saved };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateBusinessConfig = async (req, res) => {
  try {
    const b = req.body || {};
    const config = {
      businessName: (b.businessName ?? DEFAULT_BUSINESS.businessName).toString().trim() || DEFAULT_BUSINESS.businessName,
      addressLine: (b.addressLine ?? '').toString().trim(),
      phone: (b.phone ?? '').toString().trim(),
      email: (b.email ?? '').toString().trim(),
      gstin: (b.gstin ?? '').toString().trim().toUpperCase(),
      gstEnabled: !!b.gstEnabled,
      gstPercent: Math.max(0, Math.min(100, Number(b.gstPercent) || 0)),
      gstInclusive: b.gstInclusive === undefined ? true : !!b.gstInclusive,
      defaultHsnCode: (b.defaultHsnCode ?? '').toString().trim(),
      stateName: (b.stateName ?? '').toString().trim(),
      footerNote: (b.footerNote ?? '').toString().trim(),
    };
    await AppSettings.set(BUSINESS_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Category catalog ────────────────────────────────────────

// Normalize raw input into
//   { categories: [{ name, image, subCategories: [], subImages: { <sub>: url } }] }
// trimming, dropping blanks, and de-duplicating case-insensitively.
// `subCategories` stays a plain string array (every product-form/dropdown
// consumer depends on that); per-sub images live in the `subImages` map keyed
// by sub-category name. `image`/`subImages` are optional — absent on catalogs
// saved before images existed.
const cleanImg = (v) => {
  const s = (v ?? '').toString().trim();
  // Only accept our own uploaded paths / absolute URLs, cap length.
  if (!s || s.length > 300) return '';
  if (s.startsWith('/uploads/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  return '';
};
function normalizeCategories(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const categories = [];
  for (const c of list) {
    const name = (c?.name ?? '').toString().trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const subSeen = new Set();
    const subCategories = [];
    const rawSubImages = (c && typeof c.subImages === 'object' && c.subImages) || {};
    const subImages = {};
    for (const s of Array.isArray(c?.subCategories) ? c.subCategories : []) {
      const sub = (s ?? '').toString().trim();
      if (!sub) continue;
      const sk = sub.toLowerCase();
      if (subSeen.has(sk)) continue;
      subSeen.add(sk);
      subCategories.push(sub);
      const img = cleanImg(rawSubImages[sub]);
      if (img) subImages[sub] = img;
    }
    // Raw includeCategories carried through as-typed for now — resolved
    // against the final category name set (and self-references dropped)
    // in the second pass below, once every category's real name is known.
    categories.push({ name, image: cleanImg(c?.image), subCategories, subImages, includeCategories: Array.isArray(c?.includeCategories) ? c.includeCategories : [] });
  }

  // Second pass: "Also include items from" — a category may pull in another
  // category's products when browsed/filtered (e.g. Unisex → Boys, Girls).
  // Only real, other category names survive; case preserved from the
  // canonical entry so it matches Product.category exactly.
  const nameByKey = new Map(categories.map((c) => [c.name.toLowerCase(), c.name]));
  for (const c of categories) {
    const incSeen = new Set([c.name.toLowerCase()]); // no self-reference
    const resolved = [];
    for (const inc of c.includeCategories) {
      const s = (inc ?? '').toString().trim();
      if (!s) continue;
      const canonical = nameByKey.get(s.toLowerCase());
      if (!canonical) continue; // not a real category — drop silently
      const ik = canonical.toLowerCase();
      if (incSeen.has(ik)) continue;
      incSeen.add(ik);
      resolved.push(canonical);
    }
    c.includeCategories = resolved;
  }

  return { categories };
}

// Expands one filter category name into itself + whatever it's configured to
// "also include" (Settings → Categories → Unisex → Boys, Girls, say), so a
// Mongo `category` filter becomes `{ $in: [...] }`. Falls back to just the
// given name when it isn't in the catalog or has no mapping — callers can use
// the result directly as the `$in` list either way. Not a route handler;
// used by productController/orderController wherever `category` is filtered.
exports.expandCategoryFilter = async function expandCategoryFilter(categoryName) {
  const name = (categoryName ?? '').toString().trim();
  if (!name) return [];
  const saved = await AppSettings.get(CATEGORY_KEY, DEFAULT_CATEGORIES);
  const catalog = Array.isArray(saved?.categories) ? saved.categories : [];
  const entry = catalog.find((c) => (c?.name ?? '').toString().trim().toLowerCase() === name.toLowerCase());
  const includes = Array.isArray(entry?.includeCategories) ? entry.includeCategories : [];
  return [name, ...includes.filter((c) => c && c.toLowerCase() !== name.toLowerCase())];
};

exports.getCategoryConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(CATEGORY_KEY, DEFAULT_CATEGORIES);
    // Run through the normalizer so old catalogs come back with the
    // image/subImages keys present (empty), giving the editor a stable shape.
    res.json({ config: normalizeCategories(saved?.categories) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /settings/category-image  (multipart, field name "image")
// Compresses one uploaded image to a ≤250KB WebP under uploads/categories/
// and returns its web path. Used by the Settings category editor for both
// category and sub-category thumbnails.
exports.uploadCategoryImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
    const { compressToFile } = require('../utils/imageCompress');
    const { filename } = await compressToFile(req.file.buffer, 'categories');
    res.json({ url: `/uploads/categories/${filename}` });
  } catch (err) {
    res.status(500).json({ message: `Image processing failed: ${err.message}` });
  }
};

exports.updateCategoryConfig = async (req, res) => {
  try {
    const config = normalizeCategories(req.body?.categories);
    await AppSettings.set(CATEGORY_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Storefront hero carousel ─────────────────────────────────

const cleanLink = (v) => {
  const s = (v ?? '').toString().trim();
  return s.length > 300 ? '' : s;
};

function normalizeCarousel(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const slides = list.map((s, i) => ({
    id: (s?.id ?? '').toString().trim() || `${Date.now()}-${i}`,
    image: cleanImg(s?.image),
    title: (s?.title ?? '').toString().trim().slice(0, 120),
    description: (s?.description ?? '').toString().trim().slice(0, 300),
    linkUrl: cleanLink(s?.linkUrl),
    order: i,
  })).filter((s) => s.image);
  return { slides };
}

exports.getCarouselConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(CAROUSEL_KEY, DEFAULT_CAROUSEL);
    res.json({ config: normalizeCarousel(saved?.slides) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /settings/carousel-image (multipart, field name "image")
exports.uploadCarouselImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
    const { compressToFile } = require('../utils/imageCompress');
    const { filename } = await compressToFile(req.file.buffer, 'carousel');
    res.json({ url: `/uploads/carousel/${filename}` });
  } catch (err) {
    res.status(500).json({ message: `Image processing failed: ${err.message}` });
  }
};

exports.updateCarouselConfig = async (req, res) => {
  try {
    const config = normalizeCarousel(req.body?.slides);
    await AppSettings.set(CAROUSEL_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Variants & Sizes master lists ───────────────────────────

// Trim, drop blanks, de-duplicate case-insensitively, preserve order.
function normalizeStringList(raw) {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const s = (v ?? '').toString().trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

exports.getVariantConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(VARIANT_KEY, {});
    const config = {
      variants: normalizeStringList(saved?.variants),
      sizes: normalizeStringList(saved?.sizes),
      variantSelectorEnabled: !!saved?.variantSelectorEnabled,
    };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateVariantConfig = async (req, res) => {
  try {
    const config = {
      variants: normalizeStringList(req.body?.variants),
      sizes: normalizeStringList(req.body?.sizes),
      variantSelectorEnabled: !!req.body?.variantSelectorEnabled,
    };
    await AppSettings.set(VARIANT_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Payment modes ────────────────────────────────────────────

// Trim, drop blanks/dupes (by key), preserve order, uppercase-snake the key.
function normalizePaymentModes(raw) {
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(raw) ? raw : []) {
    const label = (m?.label ?? '').toString().trim().slice(0, 24);
    if (!label) continue;
    const key = (m?.key ?? label).toString().trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 24) || label.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label });
  }
  return out.length ? out : DEFAULT_PAYMENT_MODES.modes;
}

exports.getPaymentModesConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(PAYMENT_MODES_KEY, {});
    const config = { modes: normalizePaymentModes(saved?.modes?.length ? saved.modes : DEFAULT_PAYMENT_MODES.modes) };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePaymentModesConfig = async (req, res) => {
  try {
    const config = { modes: normalizePaymentModes(req.body?.modes) };
    await AppSettings.set(PAYMENT_MODES_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Merge (category, subCategory) pairs typed ad hoc elsewhere (e.g. the
// Purchase form) into the managed catalog, so they show up as real options
// everywhere next time instead of only living on that one record.
// `pairs`: [{ category, subCategory }]. Blank category entries are ignored.
exports.ensureCategoryEntries = async function ensureCategoryEntries(pairs) {
  const clean = (pairs || []).filter((p) => p?.category?.trim());
  if (!clean.length) return;

  const saved = await AppSettings.get(CATEGORY_KEY, DEFAULT_CATEGORIES);
  const categories = Array.isArray(saved?.categories) ? saved.categories.map((c) => ({ ...c, subCategories: [...(c.subCategories || [])] })) : [];
  const byKey = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  let changed = false;

  for (const { category, subCategory } of clean) {
    const name = category.trim();
    const key = name.toLowerCase();
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name, subCategories: [] };
      categories.push(entry);
      byKey.set(key, entry);
      changed = true;
    }
    const sub = (subCategory || '').trim();
    if (sub && !entry.subCategories.some((s) => s.toLowerCase() === sub.toLowerCase())) {
      entry.subCategories.push(sub);
      changed = true;
    }
  }

  if (changed) await AppSettings.set(CATEGORY_KEY, normalizeCategories(categories));
};

// Merge colors/sizes typed ad hoc elsewhere into the managed master lists.
exports.ensureVariantSizeEntries = async function ensureVariantSizeEntries({ colors, sizes } = {}) {
  const newColors = (colors || []).map((c) => (c || '').trim()).filter(Boolean);
  const newSizes = (sizes || []).map((s) => (s || '').trim()).filter(Boolean);
  if (!newColors.length && !newSizes.length) return;

  const saved = await AppSettings.get(VARIANT_KEY, DEFAULT_VARIANTS);
  const config = {
    variants: normalizeStringList([...(saved?.variants || []), ...newColors]),
    sizes: normalizeStringList([...(saved?.sizes || []), ...newSizes]),
    variantSelectorEnabled: !!saved?.variantSelectorEnabled,
  };
  await AppSettings.set(VARIANT_KEY, config);
};

// ─── Auto-delete out-of-stock products ───────────────────────

exports.getAutoDeleteConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(AUTO_DELETE_KEY, {});
    const config = { ...DEFAULT_AUTO_DELETE, ...saved };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateAutoDeleteConfig = async (req, res) => {
  try {
    const days = Math.max(1, Math.floor(Number(req.body?.days) || DEFAULT_AUTO_DELETE.days));
    const config = { enabled: !!req.body?.enabled, days };
    await AppSettings.set(AUTO_DELETE_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Label printing defaults ─────────────────────────────────

exports.getLabelPrintConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(LABEL_PRINT_KEY, {});
    const config = {
      ...DEFAULT_LABEL_PRINT,
      ...saved,
      fieldStyles: { ...(saved?.fieldStyles || {}) },
      fieldLabels: { ...(saved?.fieldLabels || {}) },
      fieldOrder: Array.isArray(saved?.fieldOrder) ? saved.fieldOrder : DEFAULT_LABEL_PRINT.fieldOrder,
    };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLabelPrintConfig = async (req, res) => {
  try {
    const b = req.body || {};
    const config = {
      ...DEFAULT_LABEL_PRINT,
      ...b,
      codeType: b.codeType === 'qr' ? 'qr' : 'barcode',
      copies: Math.max(1, Math.min(500, Number(b.copies) || DEFAULT_LABEL_PRINT.copies)),
      columns: Math.max(1, Math.min(8, Number(b.columns) || DEFAULT_LABEL_PRINT.columns)),
      contentScale: Math.max(0.3, Math.min(3, Number(b.contentScale) || DEFAULT_LABEL_PRINT.contentScale)),
      codeScale: Math.max(0.3, Math.min(3, Number(b.codeScale) || DEFAULT_LABEL_PRINT.codeScale)),
      barcodeDarkness: Math.max(1, Math.min(4, Number(b.barcodeDarkness) || DEFAULT_LABEL_PRINT.barcodeDarkness)),
      mrpScale: Math.max(1, Math.min(5, Number(b.mrpScale) || DEFAULT_LABEL_PRINT.mrpScale)),
      salePriceScale: Math.max(1, Math.min(5, Number(b.salePriceScale) || DEFAULT_LABEL_PRINT.salePriceScale)),
      barcodeWidth: Math.max(0.3, Math.min(1, Number(b.barcodeWidth) || DEFAULT_LABEL_PRINT.barcodeWidth)),
      labelPadding: Math.max(0, Math.min(8, b.labelPadding == null ? DEFAULT_LABEL_PRINT.labelPadding : Number(b.labelPadding))),
      printerDpi: Number(b.printerDpi) || DEFAULT_LABEL_PRINT.printerDpi,
      fieldOrder: Array.isArray(b.fieldOrder) ? b.fieldOrder.slice(0, 40) : DEFAULT_LABEL_PRINT.fieldOrder,
      fieldStyles: (b.fieldStyles && typeof b.fieldStyles === 'object') ? b.fieldStyles : {},
      fieldLabels: (b.fieldLabels && typeof b.fieldLabels === 'object') ? b.fieldLabels : {},
    };
    await AppSettings.set(LABEL_PRINT_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Bill / receipt print formatting ─────────────────────────

exports.getBillPrintConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(BILL_PRINT_KEY, {});
    res.json({ config: { ...DEFAULT_BILL_PRINT, ...saved } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateBillPrintConfig = async (req, res) => {
  try {
    const allowed = ['58mm', '80mm', 'A4', 'A5', 'custom'];
    const paperSize = allowed.includes(req.body?.paperSize) ? req.body.paperSize : DEFAULT_BILL_PRINT.paperSize;
    const config = {
      paperSize,
      customWidthMm: Math.max(40, Math.min(210, Number(req.body?.customWidthMm) || DEFAULT_BILL_PRINT.customWidthMm)),
    };
    await AppSettings.set(BILL_PRINT_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDisplayConfig = async (_req, res) => {
  try {
    const saved = await AppSettings.get(DISPLAY_KEY, {});
    res.json({ config: { ...DEFAULT_DISPLAY, ...saved } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateDisplayConfig = async (req, res) => {
  try {
    const dateFormat = VALID_DATE_FORMATS.includes(req.body?.dateFormat) ? req.body.dateFormat : DEFAULT_DISPLAY.dateFormat;
    const config = { dateFormat };
    await AppSettings.set(DISPLAY_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Core sweep: reconcile outOfStockSince for every product, then permanently
// delete any that have been continuously out of stock for >= configured days.
// Reused by both the manual trigger endpoint and the scheduled interval job.
// Pass an `io` instance to emit a real-time event for each deleted product.
async function runAutoDeleteSweep(io) {
  const config = { ...DEFAULT_AUTO_DELETE, ...(await AppSettings.get(AUTO_DELETE_KEY, {})) };
  const now = new Date();
  let deleted = 0;

  const products = await Product.find({}).select('quantity reservedQty images outOfStockSince name');
  const cutoffMs = config.days * 86400000;

  for (const p of products) {
    const available = p.quantity - p.reservedQty;

    if (available > 0) {
      // Back in stock — clear any pending timer.
      if (p.outOfStockSince) {
        p.outOfStockSince = null;
        await p.save();
      }
      continue;
    }

    // Out of stock. Start the timer if it isn't running yet.
    if (!p.outOfStockSince) {
      p.outOfStockSince = now;
      await p.save();
      continue;
    }

    // Only delete when the feature is enabled and the timer has elapsed.
    if (!config.enabled) continue;
    if (now - new Date(p.outOfStockSince) < cutoffMs) continue;

    await StockMovement.deleteMany({ productId: p._id });
    deleteProductImageFiles(p.images);
    await Product.findByIdAndDelete(p._id);
    if (io) io.emit('product:deleted', { productId: p._id.toString(), reason: 'auto-delete-out-of-stock' });
    deleted++;
  }

  return { deleted };
}

exports.runAutoDeleteSweep = runAutoDeleteSweep;

// Manual trigger from the settings page.
exports.runAutoDeleteNow = async (req, res) => {
  try {
    const config = { ...DEFAULT_AUTO_DELETE, ...(await AppSettings.get(AUTO_DELETE_KEY, {})) };
    if (!config.enabled) return res.status(400).json({ message: 'Auto-delete is disabled. Enable it first.' });
    const { deleted } = await runAutoDeleteSweep(req.io);
    res.json({ message: `Removed ${deleted} out-of-stock product(s)`, deleted });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Price Aging ─────────────────────────────────────────────

exports.getAgingConfig = async (_req, res) => {
  try {
    const config = await AppSettings.get(AGING_KEY, DEFAULT_AGING);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateAgingConfig = async (req, res) => {
  try {
    const { enabled, steps } = req.body;
    if (!Array.isArray(steps)) return res.status(400).json({ message: 'steps must be an array' });
    // Keep only well-formed rows (days ≥ 1, percent 0–100); de-duplicate by
    // days threshold (last one wins); sort ascending. An empty list is valid —
    // it just means "no age-based discounting", same as aging disabled.
    const byDays = new Map();
    for (const s of steps) {
      const days = Math.floor(Number(s.days));
      const percent = Math.max(0, Math.min(100, Number(s.percent)));
      if (!Number.isFinite(days) || days < 1 || !Number.isFinite(percent)) continue;
      byDays.set(days, {
        days,
        label: String(s.label ?? '').trim() || `After ${days} days`,
        percent,
      });
    }
    const config = {
      enabled: !!enabled,
      steps: [...byDays.values()].sort((a, b) => a.days - b.days),
    };
    await AppSettings.set(AGING_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Apply aging discounts to all eligible products right now (manual trigger).
//
// - Runs for EVERY aging-enabled active product, regardless of web visibility
//   (the storefront clearance page filters by isWebVisible on its own; the
//   discount itself must not depend on it).
// - The aging discount is computed from the product's MANUAL discount price
//   when it has one, otherwise from its MRP (`price`). So a product already
//   on a ₹X shop discount ages down from ₹X, not from the list price.
// - The step percentage is applied exactly — the result is NOT floored at
//   cost price. Deep clearance steps are meant to move dead stock even at a
//   loss, so a 50% step always gives a 50%-off price.
// - Idempotent: always recomputed from that fixed base (never from the current
//   effective discountPrice), so running twice in the same time frame is a
//   no-op. As a product ages into a deeper step a re-run re-prices it.
// - When a product no longer qualifies for any >0% step, its aging discount
//   is removed and it reverts to the manual discount (or full price).
exports.applyAgingNow = async (req, res) => {
  try {
    const config = await AppSettings.get(AGING_KEY, DEFAULT_AGING);
    const sortedSteps = [...config.steps].sort((a, b) => b.days - a.days); // largest first
    const now = new Date();
    let updated = 0;
    let cleared = 0;

    // Only products explicitly opted into Price Aging are ever auto-discounted.
    const products = await Product.find({ isActive: true, agingEnabled: true });
    for (const product of products) {
      // Backfill: an un-aged product with a discountPrice but no recorded
      // manual price predates this field — treat its current discount as the
      // manual one.
      if (product.manualDiscountPrice == null && !product.isAged && product.discountPrice != null) {
        product.manualDiscountPrice = product.discountPrice;
      }

      const ageDays = agingAgeDays(product, now);
      // Age down from the manual discount when there is one, else from MRP.
      const manual = product.manualDiscountPrice != null && product.manualDiscountPrice > 0
        ? product.manualDiscountPrice : null;
      const base = manual != null ? manual : product.price;

      const matchedStep = sortedSteps.find((s) => ageDays >= s.days);
      const qualifies = matchedStep && matchedStep.percent > 0 && base > 0;

      if (!qualifies) {
        // No discounting step applies (too new, all matching steps are 0%, or
        // steps/thresholds changed). Undo any aging discount this system set —
        // fall back to the manual discount, or to full price.
        if (product.isAged) {
          product.discountPrice = manual;
          product.isAged = false;
          await product.save();
          cleared++;
        } else if (product.isModified('manualDiscountPrice')) {
          await product.save(); // persist the backfill
        }
        continue;
      }

      // Compute from the base (manual discount or MRP). The step percentage is
      // applied exactly — NOT floored at cost, so clearance steps really clear.
      const discounted = base * (1 - matchedStep.percent / 100);
      const rounded = Math.max(0, Math.round(discounted * 100) / 100);

      if (rounded < base && (product.discountPrice !== rounded || !product.isAged)) {
        product.discountPrice = rounded;
        product.isAged = true; // aging-discounted → not exchangeable
        await product.save();
        updated++;
      } else if (product.isModified('manualDiscountPrice')) {
        await product.save(); // persist the backfill
      }
    }

    const parts = [`Applied aging discounts to ${updated} product(s)`];
    if (cleared) parts.push(`cleared ${cleared} no longer eligible`);
    res.json({ message: parts.join(', '), updated, cleared });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// List products grouped by aging step (for admin panel view)
exports.getAgedProducts = async (_req, res) => {
  try {
    const config = await AppSettings.get(AGING_KEY, DEFAULT_AGING);
    const sortedSteps = [...config.steps].sort((a, b) => a.days - b.days);
    const now = new Date();

    // Aged Products view only shows aging-enabled products.
    const products = await Product.find({ isActive: true, agingEnabled: true }).lean();

    const groups = sortedSteps.map((step, i) => {
      const minDays = step.days;
      const maxDays = sortedSteps[i + 1] ? sortedSteps[i + 1].days : Infinity;

      const items = products.filter((p) => {
        const ageDays = agingAgeDays(p, now);
        return ageDays >= minDays && ageDays < maxDays;
      }).map((p) => ({
        ...p,
        ageDays: Math.floor(agingAgeDays(p, now)),
        availableQty: Math.max(0, p.quantity - p.reservedQty),
      }));

      return { step, items };
    });

    // Also include products below the first step (too new)
    const firstStepDays = sortedSteps[0]?.days || 30;
    const freshProducts = products.filter((p) => agingAgeDays(p, now) < firstStepDays);

    res.json({ groups, freshCount: freshProducts.length, config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Public endpoint: products currently on aging discount for storefront clearance page
exports.getClearanceProducts = async (_req, res) => {
  try {
    const config = await AppSettings.get(AGING_KEY, DEFAULT_AGING);
    if (!config.enabled) return res.json({ products: [], enabled: false });

    const sortedSteps = [...config.steps].filter((s) => s.percent > 0).sort((a, b) => b.days - a.days);
    const now = new Date();

    const allProducts = await Product.find({ isActive: true, isWebVisible: true, agingEnabled: true })
      .select('name description category subCategory SKU barcode price discountPrice images quantity reservedQty color size createdAt agingBaseDate')
      .lean();

    // Product age and the admin's internal aging-step label (Settings →
    // Price Aging, e.g. "Slow-moving (60 days)") are inventory-management
    // details, not something a shopper should ever see — kept out of the
    // response entirely (used only here, locally, to pick the discount % and
    // sort). Only `effectiveDiscountPercent` — a clean number — goes out.
    const clearance = [];
    for (const p of allProducts) {
      const ageDays = agingAgeDays(p, now);
      const step = sortedSteps.find((s) => ageDays >= s.days);
      if (!step) continue;

      const { agingBaseDate, createdAt, ...rest } = p;
      clearance.push({
        ...rest,
        availableQty: Math.max(0, p.quantity - p.reservedQty),
        effectiveDiscountPercent: step.percent,
        _ageDays: ageDays, // sort key only — stripped before responding
      });
    }

    // Sort by discount percent desc, then age desc
    clearance.sort((a, b) => b.effectiveDiscountPercent - a.effectiveDiscountPercent || b._ageDays - a._ageDays);
    const products = clearance.map(({ _ageDays, ...p }) => p);
    res.json({ products, enabled: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
