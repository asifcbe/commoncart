const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');

exports.restock = async (req, res) => {
  try {
    const { productId, quantity, note } = req.body;
    if (!productId || !quantity || quantity <= 0)
      return res.status(400).json({ message: 'productId and positive quantity are required' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const previousQty = product.quantity;
    product.quantity += Number(quantity);
    await product.save();

    const movement = await StockMovement.create({
      productId,
      type: 'RESTOCK',
      channel: 'SYSTEM',
      quantityChanged: Number(quantity),
      previousQty,
      newQty: product.quantity,
      note: note || '',
      performedBy: req.user._id,
    });

    req.io.emit('stock:updated', { productId, quantity: product.quantity });
    res.json({ product, movement });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.adjust = async (req, res) => {
  try {
    const { productId, quantity, note, reason } = req.body;
    if (!productId || quantity === undefined)
      return res.status(400).json({ message: 'productId and quantity are required' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const previousQty = product.quantity;
    const newQty = Math.max(0, product.quantity + Number(quantity));
    product.quantity = newQty;
    await product.save();

    const movement = await StockMovement.create({
      productId,
      type: 'ADJUSTMENT',
      channel: 'SYSTEM',
      quantityChanged: Number(quantity),
      previousQty,
      newQty,
      note: note || reason || '',
      performedBy: req.user._id,
    });

    req.io.emit('stock:updated', { productId, quantity: product.quantity });
    res.json({ product, movement });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMovements = async (req, res) => {
  try {
    const { productId, type, page = 1, limit = 50 } = req.query;
    const query = {};
    if (productId) query.productId = productId;
    if (type) query.type = type;

    const skip = (Number(page) - 1) * Number(limit);
    const [movements, total] = await Promise.all([
      StockMovement.find(query)
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .populate('productId', 'name SKU barcode')
        .populate('performedBy', 'name'),
      StockMovement.countDocuments(query),
    ]);

    res.json({ movements, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLowStock = async (_req, res) => {
  try {
    const products = await Product.find({ isActive: true }).lean();
    const lowStock = products.filter((p) => p.quantity - p.reservedQty <= p.lowStockThreshold);
    res.json({ products: lowStock, count: lowStock.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /inventory/overview?category=&subCategory=&stockStatus=in|out
// Cost-valuation totals + category → sub-category → variant/size breakdown,
// computed entirely in MongoDB via aggregation. Replaces the old approach of
// paging the WHOLE active catalog into the browser (thousands of products on
// a mature shop) just to sum/group it client-side — this returns only the
// aggregated numbers, so response size stays small regardless of catalog size.
exports.getOverview = async (req, res) => {
  try {
    const { category, subCategory, stockStatus } = req.query;

    const match = { isActive: true };
    if (category) match.category = category;
    if (subCategory) match.subCategory = subCategory;
    // "out" = nothing available to sell (quantity - reservedQty <= 0); "in" = the opposite.
    if (stockStatus === 'out') match.$expr = { $lte: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] };
    else if (stockStatus === 'in') match.$expr = { $gt: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] };

    const pipeline = [
      { $match: match },
      {
        $project: {
          category: { $ifNull: ['$category', 'Uncategorized'] },
          subCategory: { $ifNull: [{ $cond: [{ $eq: ['$subCategory', ''] }, null, '$subCategory'] }, '—'] },
          color: { $ifNull: [{ $cond: [{ $eq: ['$color', ''] }, null, '$color'] }, '—'] },
          size: { $ifNull: [{ $cond: [{ $eq: ['$size', ''] }, null, '$size'] }, '—'] },
          quantity: 1,
          cost: { $multiply: [{ $ifNull: ['$costPrice', 0] }, '$quantity'] },
          isOut: { $lte: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] },
        },
      },
      {
        $group: {
          _id: { category: '$category', subCategory: '$subCategory', color: '$color', size: '$size' },
          units: { $sum: '$quantity' },
          cost: { $sum: '$cost' },
          skus: { $sum: 1 },
          outOfStock: { $sum: { $cond: ['$isOut', 1, 0] } },
        },
      },
    ];

    const rows = await Product.aggregate(pipeline);

    // Fold the flat (category, subCategory, color, size) rows into the
    // nested shape the Overview UI groups by — same grouping logic the old
    // client-side reduce did, just fed by pre-aggregated rows instead of
    // every individual product.
    const catMap = new Map();
    const totals = { units: 0, cost: 0, skus: 0, outOfStock: 0 };
    for (const r of rows) {
      const { category: cat, subCategory: sub, color, size } = r._id;
      totals.units += r.units; totals.cost += r.cost; totals.skus += r.skus; totals.outOfStock += r.outOfStock;

      if (!catMap.has(cat)) catMap.set(cat, { category: cat, units: 0, cost: 0, skus: 0, subs: new Map() });
      const g = catMap.get(cat);
      g.units += r.units; g.cost += r.cost; g.skus += r.skus;

      if (!g.subs.has(sub)) g.subs.set(sub, { sub, units: 0, cost: 0, skus: 0, vs: [] });
      const s = g.subs.get(sub);
      s.units += r.units; s.cost += r.cost; s.skus += r.skus;
      s.vs.push({ variant: color, size, units: r.units, cost: r.cost, skus: r.skus });
    }

    const groups = [...catMap.values()]
      .map((g) => ({
        ...g,
        subs: [...g.subs.values()]
          .map((s) => ({ ...s, vs: s.vs.sort((a, b) => b.cost - a.cost) }))
          .sort((a, b) => b.cost - a.cost),
      }))
      .sort((a, b) => b.cost - a.cost);

    res.json({ totals, groups });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /inventory/categories?category= — distinct category/sub-category names
// for the Overview filter dropdowns (active products only). Sub-categories
// are scoped to the given category when one's provided, matching how the
// Sub-category dropdown resets/narrows when Category changes. Tiny, cheap
// query — avoids needing the full product list just to populate two <select>s.
exports.getOverviewFilters = async (req, res) => {
  try {
    const { category } = req.query;
    const categories = (await Product.distinct('category', { isActive: true })).filter(Boolean).sort();
    const subScope = { isActive: true, ...(category ? { category } : {}) };
    const subCategoriesRaw = await Product.distinct('subCategory', subScope);
    const subCategories = subCategoriesRaw.filter(Boolean).sort();
    res.json({ categories, subCategories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /inventory/barcodes?category=&subCategory=&color=&size=&stockStatus=
// Lean list of { name, barcode, SKU } for one breakdown slice — the "View
// Barcodes" link on each Overview row (category / sub-category / variant)
// fetches this on demand rather than the aggregation ever carrying barcodes
// (which would bloat every Overview load for a feature only used occasionally).
exports.getBreakdownBarcodes = async (req, res) => {
  try {
    const { category, subCategory, color, size, stockStatus } = req.query;
    const match = { isActive: true };
    if (category) match.category = category;
    if (subCategory) match.subCategory = subCategory === '—' ? { $in: [null, ''] } : subCategory;
    if (color) match.color = color === '—' ? { $in: [null, ''] } : color;
    if (size) match.size = size === '—' ? { $in: [null, ''] } : size;
    if (stockStatus === 'out') match.$expr = { $lte: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] };
    else if (stockStatus === 'in') match.$expr = { $gt: [{ $subtract: ['$quantity', '$reservedQty'] }, 0] };

    const products = await Product.find(match).select('name barcode SKU').sort('name').lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
