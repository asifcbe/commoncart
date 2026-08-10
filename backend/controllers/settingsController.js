const AppSettings = require('../models/AppSettings');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { deleteProductImageFiles } = require('../utils/productImages');

const CREDIT_KEY = 'CREDIT_CONFIG';
const DEFAULT_CREDIT = { rupeesPerPoint: 1000, pointValue: 1 };

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
  stateName: '',
  footerNote: 'Thank you for shopping!',
};

// Managed category catalog. Shape: { categories: [{ name, subCategories: [string] }] }
// Products may only be created against categories/sub-categories defined here.
const CATEGORY_KEY = 'CATEGORY_CONFIG';
const DEFAULT_CATEGORIES = { categories: [] };

// Auto-delete out-of-stock products. enabled + days (after continuously
// out of stock) before the product is permanently removed.
const AUTO_DELETE_KEY = 'AUTO_DELETE_CONFIG';
const DEFAULT_AUTO_DELETE = { enabled: false, days: 3 };

// Managed master lists of variants (colors) and sizes. Products/purchases may
// only use values defined here (the UI also allows adding new ones inline).
const VARIANT_KEY = 'VARIANT_CONFIG';
const DEFAULT_VARIANTS = { variants: [], sizes: [] };

// Default barcode-label printing preferences applied when a print dialog opens.
const LABEL_PRINT_KEY = 'LABEL_PRINT_CONFIG';
const DEFAULT_LABEL_PRINT = {
  sizeId: '50x25',          // built-in preset id, or 'custom'
  customWidthMm: 50,        // used when sizeId === 'custom'
  customHeightMm: 25,
  layout: '1up',            // '1up' | '2up'
  symbology: 'CODE128',     // 'CODE128' | 'EAN13'
  content: { company: true, name: true, price: true, variant: true, size: true, sku: false },
  pricePrefix: 'MRP',       // printed before the regular price, e.g. "MRP: ₹100"
  discountPrefix: 'Offer Price', // printed before the discounted price
  defaultCopies: 1,         // default number of copies per label when a print dialog opens
};

// Bill / receipt print formatting (POS + purchase bills).
const BILL_PRINT_KEY = 'BILL_PRINT_CONFIG';
const DEFAULT_BILL_PRINT = {
  paperSize: '80mm',        // '58mm' | '80mm' | 'A4' | 'A5' | 'custom'
  customWidthMm: 80,        // roll width when paperSize === 'custom'
};

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
    const config = await AppSettings.get(CREDIT_KEY, DEFAULT_CREDIT);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateCreditConfig = async (req, res) => {
  try {
    const { rupeesPerPoint, pointValue } = req.body;
    if (!rupeesPerPoint || rupeesPerPoint < 1) return res.status(400).json({ message: 'rupeesPerPoint must be >= 1' });
    if (!pointValue || pointValue < 0.01) return res.status(400).json({ message: 'pointValue must be >= 0.01' });
    const config = { rupeesPerPoint: Number(rupeesPerPoint), pointValue: Number(pointValue) };
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

// Normalize raw input into { categories: [{ name, subCategories: [] }] },
// trimming, dropping blanks, and de-duplicating case-insensitively.
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
    for (const s of Array.isArray(c?.subCategories) ? c.subCategories : []) {
      const sub = (s ?? '').toString().trim();
      if (!sub) continue;
      const sk = sub.toLowerCase();
      if (subSeen.has(sk)) continue;
      subSeen.add(sk);
      subCategories.push(sub);
    }
    categories.push({ name, subCategories });
  }
  return { categories };
}

exports.getCategoryConfig = async (_req, res) => {
  try {
    const config = await AppSettings.get(CATEGORY_KEY, DEFAULT_CATEGORIES);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      content: { ...DEFAULT_LABEL_PRINT.content, ...(saved?.content || {}) },
    };
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLabelPrintConfig = async (req, res) => {
  try {
    const b = req.body || {};
    const layout = b.layout === '2up' ? '2up' : '1up';
    const symbology = b.symbology === 'EAN13' ? 'EAN13' : 'CODE128';
    const config = {
      sizeId: (b.sizeId || DEFAULT_LABEL_PRINT.sizeId).toString(),
      customWidthMm: Math.max(10, Math.min(300, Number(b.customWidthMm) || DEFAULT_LABEL_PRINT.customWidthMm)),
      customHeightMm: Math.max(10, Math.min(300, Number(b.customHeightMm) || DEFAULT_LABEL_PRINT.customHeightMm)),
      layout,
      symbology,
      content: {
        company: !!b.content?.company,
        name: b.content?.name !== false,
        price: b.content?.price !== false,
        variant: b.content?.variant !== false,
        size: b.content?.size !== false,
        sku: !!b.content?.sku,
      },
      pricePrefix: (b.pricePrefix ?? DEFAULT_LABEL_PRINT.pricePrefix).toString().trim().slice(0, 24),
      discountPrefix: (b.discountPrefix ?? DEFAULT_LABEL_PRINT.discountPrefix).toString().trim().slice(0, 24),
      defaultCopies: Math.max(1, Math.min(50, parseInt(b.defaultCopies, 10) || DEFAULT_LABEL_PRINT.defaultCopies)),
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
    const config = {
      enabled: !!enabled,
      steps: steps.map((s) => ({
        days: Number(s.days),
        label: String(s.label),
        percent: Math.max(0, Math.min(100, Number(s.percent))),
      })).sort((a, b) => a.days - b.days),
    };
    await AppSettings.set(AGING_KEY, config);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Apply aging discounts to all eligible products right now (manual trigger)
exports.applyAgingNow = async (req, res) => {
  try {
    const config = await AppSettings.get(AGING_KEY, DEFAULT_AGING);
    const sortedSteps = [...config.steps].sort((a, b) => b.days - a.days); // largest first
    const now = new Date();
    let updated = 0;

    const products = await Product.find({ isActive: true, isWebVisible: true });
    for (const product of products) {
      const ageMs = now - new Date(product.createdAt);
      const ageDays = ageMs / 86400000;

      const matchedStep = sortedSteps.find((s) => ageDays >= s.days);
      if (!matchedStep || matchedStep.percent <= 0) continue;

      // Compute discounted price from the base (original) price
      // Use costPrice-floor to avoid selling below cost
      const base = product.price;
      if (!base || base <= 0) continue;

      const discounted = Math.max(product.costPrice || 0, base * (1 - matchedStep.percent / 100));
      const rounded = Math.round(discounted * 100) / 100;

      if (rounded < base) {
        product.discountPrice = rounded;
        product.isAged = true; // mark as aging-discounted → not exchangeable
        await product.save();
        updated++;
      }
    }

    res.json({ message: `Applied aging discounts to ${updated} product(s)`, updated });
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

    const products = await Product.find({ isActive: true }).lean();

    const groups = sortedSteps.map((step, i) => {
      const minDays = step.days;
      const maxDays = sortedSteps[i + 1] ? sortedSteps[i + 1].days : Infinity;

      const items = products.filter((p) => {
        const ageDays = (now - new Date(p.createdAt)) / 86400000;
        return ageDays >= minDays && ageDays < maxDays;
      }).map((p) => ({
        ...p,
        ageDays: Math.floor((now - new Date(p.createdAt)) / 86400000),
        availableQty: Math.max(0, p.quantity - p.reservedQty),
      }));

      return { step, items };
    });

    // Also include products below the first step (too new)
    const firstStepDays = sortedSteps[0]?.days || 30;
    const freshProducts = products.filter((p) => {
      const ageDays = (now - new Date(p.createdAt)) / 86400000;
      return ageDays < firstStepDays;
    });

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

    const allProducts = await Product.find({ isActive: true, isWebVisible: true })
      .select('name description category SKU barcode price costPrice discountPrice images quantity reservedQty color size createdAt')
      .lean();

    const clearance = [];
    for (const p of allProducts) {
      const ageDays = (now - new Date(p.createdAt)) / 86400000;
      const step = sortedSteps.find((s) => ageDays >= s.days);
      if (!step) continue;

      clearance.push({
        ...p,
        availableQty: Math.max(0, p.quantity - p.reservedQty),
        ageDays: Math.floor(ageDays),
        agingStep: step,
        effectiveDiscountPercent: step.percent,
      });
    }

    // Sort by discount percent desc, then age desc
    clearance.sort((a, b) => b.effectiveDiscountPercent - a.effectiveDiscountPercent || b.ageDays - a.ageDays);
    res.json({ products: clearance, enabled: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
