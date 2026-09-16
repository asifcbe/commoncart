const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const generateSKU = require('../utils/generateSKU');
const { generateEAN13 } = require('../utils/generateBarcode');
const { deleteProductImageFiles } = require('../utils/productImages');
const { expandCategoryFilter, validateCatalogEntries } = require('./settingsController');

// Parses a form dimension field ('' / undefined / a number string) into
// Number|null the way Product.widthInches/heightInches expect.
function parseDimension(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Turn an "age is between minDays and maxDays old" window into a Mongo filter
// on the product's aging base date (agingBaseDate, falling back to createdAt).
// older  ⇢ smaller date;  age ≥ minDays  ⇢  baseDate ≤ (now - minDays)
//                          age <  maxDays ⇢  baseDate >  (now - maxDays)
function agingWindowFilter(minDays, maxDays) {
  const now = Date.now();
  const DAY = 86400000;
  const range = {};
  if (Number.isFinite(minDays)) range.$lte = new Date(now - minDays * DAY);
  if (Number.isFinite(maxDays)) range.$gt = new Date(now - maxDays * DAY);
  // agingBaseDate set → use it; else fall back to createdAt.
  return {
    $or: [
      { agingBaseDate: { $ne: null, ...range } },
      { agingBaseDate: null, createdAt: range },
      { agingBaseDate: { $exists: false }, createdAt: range },
    ],
  };
}

exports.listProducts = async (req, res) => {
  try {
    const { search, category, subCategory, color, size, page = 1, limit = 20, sort = '-createdAt', isActive, isWebVisible, agingBucket, stockStatus } = req.query;

    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isWebVisible !== undefined) query.isWebVisible = isWebVisible === 'true';
    // "out" = nothing available to sell (quantity - reservedQty <= 0); "in" = the opposite.
    if (stockStatus === 'out') query.$expr = { $lte: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] };
    else if (stockStatus === 'in') query.$expr = { $gt: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] };
    // A category may be configured to "also include" other categories
    // (Settings → Categories, e.g. Unisex → Boys, Girls) — expand to $in so
    // browsing/filtering by it surfaces those products too.
    if (category) {
      const expanded = await expandCategoryFilter(category);
      query.category = expanded.length > 1 ? { $in: expanded } : category;
    }
    if (subCategory) query.subCategory = subCategory;
    if (color) query.color = color;
    if (size) query.size = size;
    if (search) query.$text = { $search: search };

    // Price-aging filter. Values:
    //   'enabled'      → every product opted into aging
    //   'aged'         → products that currently carry an aging discount
    //   'not-aged'     → aging-enabled but not yet auto-discounted
    //   '<min>-<max>'  → aging-enabled products whose age (from agingBaseDate)
    //                    falls in that day window ('<min>+' = open-ended)
    if (agingBucket) {
      if (agingBucket === 'enabled') {
        query.agingEnabled = true;
      } else if (agingBucket === 'aged') {
        query.isAged = true;
      } else if (agingBucket === 'not-aged') {
        query.agingEnabled = true;
        query.isAged = { $ne: true };
      } else {
        const m = String(agingBucket).match(/^(\d+)-(\d+)$/) || String(agingBucket).match(/^(\d+)(\+)$/);
        if (m) {
          const minDays = Number(m[1]);
          const maxDays = m[2] === '+' ? Infinity : Number(m[2]);
          query.agingEnabled = true;
          Object.assign(query, agingWindowFilter(minDays, maxDays));
        }
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { name, description, category, subCategory, color, size, price, discountPrice, costPrice, quantity, supplier, location, lowStockThreshold, isWebVisible, agingEnabled, hsnCode, gstPercent, widthInches, heightInches, isSet, set2WidthInches, set2HeightInches } = req.body;
    const providedBarcode = (req.body.barcode || '').trim();
    const providedSKU = (req.body.SKU || '').trim();

    if (!name || !category || price === undefined)
      return res.status(400).json({ message: 'name, category and price are required' });

    // Category/sub-category/color/size may only be created in Settings.
    await validateCatalogEntries([{ category, subCategory }], { colors: [color], sizes: [size] });

    // Use the provided barcode if given (e.g. an existing product's barcode);
    // otherwise auto-generate one. Reject duplicates up front for a clear message.
    let barcode;
    if (providedBarcode) {
      const clash = await Product.findOne({ barcode: providedBarcode });
      if (clash) return res.status(409).json({ message: `Barcode "${providedBarcode}" is already used by "${clash.name}".` });
      barcode = providedBarcode;
    } else {
      barcode = await generateEAN13();
    }

    // Use the provided SKU if given, otherwise auto-generate; reject duplicates.
    let SKU;
    if (providedSKU) {
      const clash = await Product.findOne({ SKU: providedSKU });
      if (clash) return res.status(409).json({ message: `SKU "${providedSKU}" is already used by "${clash.name}".` });
      SKU = providedSKU;
    } else {
      SKU = await generateSKU(category, name);
    }

    const images = req.files ? req.files.map((f) => `/uploads/products/${f.filename}`) : [];
    const widthIn = parseDimension(widthInches);
    const heightIn = parseDimension(heightInches);
    const isSetOn = isSet === true || isSet === 'true';
    const set2WidthIn = isSetOn ? parseDimension(set2WidthInches) : null;
    const set2HeightIn = isSetOn ? parseDimension(set2HeightInches) : null;

    const product = await Product.create({
      name, description, category, subCategory: (subCategory || '').trim(),
      color: (color || '').trim(), size: (size || '').trim(),
      price: Number(price),
      // Optional. Blank / 0 / not-below-MRP → no discount (null). The same
      // value is the "manual" discount (kept so Price Aging can age down from
      // it and restore it later) and the initial effective discountPrice.
      discountPrice: (discountPrice === '' || discountPrice == null || Number(discountPrice) <= 0 || Number(discountPrice) >= Number(price))
        ? null : Number(discountPrice),
      manualDiscountPrice: (discountPrice === '' || discountPrice == null || Number(discountPrice) <= 0 || Number(discountPrice) >= Number(price))
        ? null : Number(discountPrice),
      costPrice: Number(costPrice) || 0,
      quantity: Number(quantity) || 0,
      supplier, location,
      lowStockThreshold: Number(lowStockThreshold) || 10,
      // Hidden from the web store by default — only visible when explicitly enabled
      isWebVisible: isWebVisible === true || isWebVisible === 'true',
      // Opt-in to Price Aging — off unless explicitly enabled.
      agingEnabled: agingEnabled === true || agingEnabled === 'true',
      hsnCode: (hsnCode || '').trim(),
      gstPercent: gstPercent === '' || gstPercent == null ? null : Math.max(0, Math.min(100, Number(gstPercent))),
      widthInches: widthIn, heightInches: heightIn,
      isSet: isSetOn, set2WidthInches: set2WidthIn, set2HeightInches: set2HeightIn,
      SKU, barcode, images,
    });

    res.status(201).json({ product });
  } catch (err) {
    res.status(err.isCatalogValidation ? 400 : 500).json({ message: err.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.SKU;
    delete updates.barcode;
    delete updates._id;

    // Category/sub-category/color/size may only be created in Settings —
    // validate whenever any of these are part of this update.
    if ('category' in updates || 'subCategory' in updates || 'color' in updates || 'size' in updates) {
      const current = await Product.findById(req.params.id).select('category subCategory color size');
      if (!current) return res.status(404).json({ message: 'Product not found' });
      await validateCatalogEntries(
        [{ category: updates.category ?? current.category, subCategory: updates.subCategory ?? current.subCategory }],
        { colors: [updates.color ?? current.color], sizes: [updates.size ?? current.size] }
      );
    }
    // Unlike hsnCode (a String field where '' is valid), gstPercent is a
    // Number field — an empty-string value from the form must become null
    // ("use shop default"), not fail Mongoose's Number cast.
    if (updates.gstPercent === '') updates.gstPercent = null;

    // discountPrice from the form is the MANUAL (shop-set) discount. A blank
    // field clears it; a value that isn't a real discount (0, or >= MRP) is
    // also cleared. We store it as `manualDiscountPrice` and set the effective
    // `discountPrice` to it — Price Aging re-tightens it on the next apply.
    if ('discountPrice' in updates) {
      const dp = Number(updates.discountPrice);
      const mrp = updates.price != null ? Number(updates.price)
        : Number((await Product.findById(req.params.id).select('price'))?.price || 0);
      const manual = (updates.discountPrice === '' || updates.discountPrice == null || Number.isNaN(dp) || dp <= 0 || (mrp > 0 && dp >= mrp))
        ? null : dp;
      updates.manualDiscountPrice = manual;
      updates.discountPrice = manual;
      updates.isAged = false; // a changed manual price supersedes any aged price until re-applied
    }

    // agingEnabled comes from FormData as the string "true"/"false" — coerce.
    // Turning it OFF also clears any aging discount already applied — the
    // price reverts to the manual discount (not to full price).
    if ('agingEnabled' in updates) {
      const on = updates.agingEnabled === true || updates.agingEnabled === 'true';
      updates.agingEnabled = on;
      if (!on && !('discountPrice' in updates)) {
        const cur = await Product.findById(req.params.id).select('manualDiscountPrice discountPrice isAged');
        updates.isAged = false;
        updates.discountPrice = cur?.manualDiscountPrice ?? null;
      }
    }
    if ('isWebVisible' in updates) {
      updates.isWebVisible = updates.isWebVisible === true || updates.isWebVisible === 'true';
    }

    if ('widthInches' in updates) updates.widthInches = parseDimension(updates.widthInches);
    if ('heightInches' in updates) updates.heightInches = parseDimension(updates.heightInches);

    // isSet comes from FormData as "true"/"false". The second ruler's
    // dimensions only mean anything while isSet is on — clear them together
    // when it's turned off so a stale pair can't resurface if it's re-enabled
    // without the form resending them.
    if ('isSet' in updates) {
      const on = updates.isSet === true || updates.isSet === 'true';
      updates.isSet = on;
      if (!on) { updates.set2WidthInches = null; updates.set2HeightInches = null; }
    }
    if ('set2WidthInches' in updates) updates.set2WidthInches = parseDimension(updates.set2WidthInches);
    if ('set2HeightInches' in updates) updates.set2HeightInches = parseDimension(updates.set2HeightInches);

    // ── Images ──────────────────────────────────────────────
    // The form may send `keepImages` — a JSON array of existing image paths
    // the user chose to keep. New uploads (req.files) are appended. Any
    // existing image NOT in keepImages is removed from disk.
    let removedImages = [];
    const hasKeep = 'keepImages' in updates;
    const hasNewFiles = req.files && req.files.length > 0;

    if (hasKeep || hasNewFiles) {
      const existing = await Product.findById(req.params.id).select('images');
      const oldImages = existing?.images || [];

      let kept;
      if (hasKeep) {
        let parsed;
        try { parsed = JSON.parse(updates.keepImages); } catch { parsed = null; }
        // Only trust paths that were actually on this product.
        kept = Array.isArray(parsed) ? parsed.filter((p) => oldImages.includes(p)) : oldImages;
      } else {
        // No keepImages sent but new files uploaded → legacy behaviour: replace.
        kept = [];
      }

      const added = hasNewFiles ? req.files.map((f) => `/uploads/products/${f.filename}`) : [];
      updates.images = [...kept, ...added].slice(0, 5);
      removedImages = oldImages.filter((p) => !kept.includes(p));
    }
    delete updates.keepImages;

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Delete de-selected / replaced image files from disk
    if (removedImages.length) deleteProductImageFiles(removedImages);

    res.json({ product });
  } catch (err) {
    res.status(err.isCatalogValidation ? 400 : 500).json({ message: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const movementCount = await StockMovement.countDocuments({ productId: req.params.id });
    await StockMovement.deleteMany({ productId: req.params.id });

    // Remove the product's image files from disk before deleting the record
    deleteProductImageFiles(product.images);

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: 'Product permanently deleted', deletedMovements: movementCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getByBarcode = async (req, res) => {
  try {
    const product = await Product.findOne({ barcode: req.params.code, isActive: true });
    if (!product) return res.status(404).json({ message: 'Product not found for this barcode' });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCategories = async (_req, res) => {
  try {
    const categories = await Product.distinct('category', { isActive: true });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
