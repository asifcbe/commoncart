const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const StockMovement = require('../models/StockMovement');
const SaleTransaction = require('../models/SaleTransaction');
const Order = require('../models/Order');
const { generateEAN13 } = require('../utils/generateBarcode');
const { withUniqueDocNumber } = require('../utils/invoiceNumber');
const { ensureCategoryEntries, ensureVariantSizeEntries } = require('./settingsController');

// Resolve items: each unit (qty=1 each) gets its own unique barcode and product entry.
// Items sent from the frontend are already collapsed by variant (name+color+size, qty>1).
// We expand them: qty=3 → 3 separate product records, each with a unique barcode.
//
// Batched for large purchases (100s–1000s of units): a single countDocuments() seeds
// SKU numbering, barcodes are reserved once via generateEAN13(count), and every product
// is written in one insertMany() instead of N sequential creates.
async function resolveItems(items, supplier) {
  const docs = [];
  let totalCost = 0;
  let skuSeed = null;

  // How many units need a generated (not frontend-supplied) barcode
  const missingBarcodeCount = items.reduce((n, item) => n + (item.barcode ? 0 : Number(item.qty)), 0);
  const generatedBarcodes = missingBarcodeCount > 0 ? await generateEAN13(missingBarcodeCount) : [];
  let generatedIdx = 0;

  for (const item of items) {
    const qty = Number(item.qty);
    const costPrice = Number(item.costPrice) || 0;
    const category = item.category?.trim() || 'General';
    const prefix = (category.slice(0, 3) + item.name.trim().slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');

    for (let unitIdx = 0; unitIdx < qty; unitIdx++) {
      if (skuSeed === null) skuSeed = await Product.countDocuments();
      const SKU = `${prefix}-${String(skuSeed + 1).padStart(5, '0')}`;
      skuSeed += 1;

      const barcode = item.barcode || generatedBarcodes[generatedIdx++];

      docs.push({
        name: item.name.trim(),
        description: item.description || '',
        category,
        subCategory: (item.subCategory || '').trim(),
        price: Number(item.price) || 0,
        costPrice,
        quantity: 1, // each purchase line unit is always qty:1
        supplier: supplier || '',
        lowStockThreshold: Number(item.lowStockThreshold) || 10,
        isWebVisible: false,
        color: (item.color || '').trim(),
        size: (item.size || '').trim(),
        discountPrice: item.discountPrice != null && item.discountPrice !== '' ? Number(item.discountPrice) : null,
        SKU,
        barcode,
      });

      totalCost += costPrice;
    }
  }

  const created = await Product.insertMany(docs, { ordered: true });

  const resolvedItems = created.map((product) => ({
    productId: product._id,
    barcode: product.barcode,
    name: product.name,
    category: product.category,
    subCategory: product.subCategory,
    description: product.description,
    qty: 1,
    costPrice: product.costPrice,
    price: product.price,
    color: product.color,
    size: product.size,
    discountPrice: product.discountPrice,
  }));

  return { resolvedItems, totalCost, createdProducts: created };
}

exports.createPurchase = async (req, res) => {
  try {
    const { supplierId, supplier: supplierName, items, note, purchaseDate } = req.body;

    if (!items || !items.length)
      return res.status(400).json({ message: 'At least one item is required' });

    // Resolve supplier
    let resolvedSupplierName = supplierName || '';
    let resolvedSupplierId = null;

    if (supplierId) {
      const sup = await Supplier.findById(supplierId);
      if (sup) { resolvedSupplierName = sup.name; resolvedSupplierId = sup._id; }
    }

    const { resolvedItems, totalCost, createdProducts } = await resolveItems(items, resolvedSupplierName);

    // New category/sub-category/color/size typed ad hoc on this purchase join
    // the managed catalog so they appear as real options everywhere next time.
    await Promise.all([
      ensureCategoryEntries(items.map((it) => ({ category: it.category, subCategory: it.subCategory }))),
      ensureVariantSizeEntries({ colors: items.map((it) => it.color), sizes: items.map((it) => it.size) }),
    ]);

    // withUniqueDocNumber retries with a fresh purchaseId if the PUR counter
    // has drifted behind an existing document (self-heals instead of failing
    // the purchase after products were already created above).
    const purchase = await withUniqueDocNumber('PUR', (purchaseId) => Purchase.create({
      purchaseId,
      supplierId: resolvedSupplierId,
      supplier: resolvedSupplierName,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      items: resolvedItems,
      totalCost,
      note: note || '',
      purchasedBy: req.user._id,
    }));
    const purchaseId = purchase.purchaseId;

    // Each product was already created with quantity:1 (its full restocked amount) —
    // no separate read-modify-write needed. Write all stock movements in one batch.
    const movementNote = `Purchase ${purchaseId}${resolvedSupplierName ? ` from ${resolvedSupplierName}` : ''}`;
    await StockMovement.insertMany(
      createdProducts.map((product) => ({
        productId: product._id,
        type: 'RESTOCK',
        channel: 'SYSTEM',
        quantityChanged: product.quantity,
        previousQty: 0,
        newQty: product.quantity,
        note: movementNote,
        performedBy: req.user._id,
        transactionId: purchaseId,
      }))
    );

    for (const product of createdProducts) {
      req.io.emit('stock:updated', {
        productId: product._id.toString(),
        quantity: product.quantity,
        reservedQty: product.reservedQty,
      });
    }

    // Increase supplier balance (amount owed to supplier)
    if (resolvedSupplierId) {
      await Supplier.findByIdAndUpdate(resolvedSupplierId, { $inc: { balance: totalCost } });
    }

    res.status(201).json({ purchase });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePurchase = async (req, res) => {
  try {
    const { supplierId, supplier: supplierName, note, purchaseDate, itemOverrides } = req.body;

    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    let resolvedSupplierName = supplierName !== undefined ? supplierName : purchase.supplier;
    let resolvedSupplierId = purchase.supplierId;

    if (supplierId && supplierId !== String(purchase.supplierId)) {
      const sup = await Supplier.findById(supplierId);
      if (sup) { resolvedSupplierName = sup.name; resolvedSupplierId = sup._id; }
    }

    purchase.supplier = resolvedSupplierName;
    purchase.supplierId = resolvedSupplierId;
    if (note !== undefined) purchase.note = note;
    if (purchaseDate) purchase.purchaseDate = new Date(purchaseDate);

    // Apply full item overrides to purchase items + underlying products
    if (itemOverrides && typeof itemOverrides === 'object') {
      const overrides = Object.values(itemOverrides);
      await Promise.all([
        ensureCategoryEntries(overrides.map((ov) => ({ category: ov.category, subCategory: ov.subCategory }))),
        ensureVariantSizeEntries({ colors: overrides.map((ov) => ov.color), sizes: overrides.map((ov) => ov.size) }),
      ]);

      for (const [idxStr, ov] of Object.entries(itemOverrides)) {
        const idx = Number(idxStr);
        const purchaseItem = purchase.items[idx];
        if (!purchaseItem) continue;

        const product = await Product.findById(purchaseItem.productId);
        if (!product) continue;

        // Update purchase item snapshot
        if (ov.name != null && ov.name.trim()) purchaseItem.name = ov.name.trim();
        if (ov.category != null) purchaseItem.category = ov.category.trim();
        if (ov.subCategory != null) purchaseItem.subCategory = ov.subCategory.trim();
        if (ov.description != null) purchaseItem.description = ov.description;
        if (ov.color != null) purchaseItem.color = ov.color.trim();
        if (ov.size != null) purchaseItem.size = ov.size.trim();
        if (ov.qty != null && Number(ov.qty) > 0) {
          const diff = Number(ov.qty) - purchaseItem.qty;
          purchaseItem.qty = Number(ov.qty);
          if (diff !== 0) {
            const prev = product.quantity;
            product.quantity = Math.max(0, product.quantity + diff);
            if (product.quantity > 0 && !product.isActive) product.isActive = true;
            await StockMovement.create({
              productId: product._id,
              type: 'ADJUSTMENT',
              channel: 'SYSTEM',
              quantityChanged: diff,
              previousQty: prev,
              newQty: product.quantity,
              note: `Purchase edit ${purchase.purchaseId}`,
              performedBy: req.user._id,
              transactionId: purchase.purchaseId,
            });
            if (req.io) {
              req.io.emit('stock:updated', {
                productId: product._id.toString(),
                quantity: product.quantity,
                reservedQty: product.reservedQty,
              });
            }
          }
        }
        if (ov.costPrice != null && ov.costPrice !== '') {
          purchaseItem.costPrice = Number(ov.costPrice);
          product.costPrice = Number(ov.costPrice);
        }
        if (ov.price != null && ov.price !== '') {
          purchaseItem.price = Number(ov.price);
          product.price = Number(ov.price);
        }
        if (ov.discountPrice != null && ov.discountPrice !== '') {
          purchaseItem.discountPrice = Number(ov.discountPrice);
          product.discountPrice = Number(ov.discountPrice);
        } else if (ov.discountPrice === '' || ov.discountPrice === null) {
          purchaseItem.discountPrice = null;
          product.discountPrice = null;
        }
        // Update product name/category/description/color/size
        if (ov.name?.trim()) product.name = ov.name.trim();
        if (ov.category != null) product.category = ov.category.trim() || product.category;
        if (ov.subCategory != null) product.subCategory = ov.subCategory.trim();
        if (ov.description != null) product.description = ov.description;
        if (ov.color != null) product.color = ov.color.trim();
        if (ov.size != null) product.size = ov.size.trim();

        await product.save();
      }
    }

    // Recalculate total
    purchase.totalCost = purchase.items.reduce((s, it) => s + it.qty * it.costPrice, 0);

    await purchase.save();
    res.json({ purchase });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    const summary = { productsDeleted: [], productsDeactivated: [], stockReversed: [] };
    // Every purchase item is its own unit-product (qty:1, unique barcode) — no
    // other purchase or sale ever shares a productId, so nothing here is ever
    // "restocked elsewhere." A unit is only worth keeping (deactivated, not
    // deleted) if it has a real financial trail: it was sold in a POS sale or
    // ordered online. Anything untouched since the purchase can simply cease
    // to exist, so it stops cluttering Products / Barcode Management too.
    const productIds = purchase.items.map((it) => it.productId);

    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const [soldInStore, soldOnline] = await Promise.all([
      SaleTransaction.find({ 'items.productId': { $in: productIds } }, { 'items.productId': 1 }),
      Order.find({ 'items.productId': { $in: productIds } }, { 'items.productId': 1 }),
    ]);
    const everSold = new Set();
    soldInStore.forEach((s) => s.items.forEach((it) => everSold.add(String(it.productId))));
    soldOnline.forEach((o) => o.items.forEach((it) => everSold.add(String(it.productId))));

    const idsToDelete = [];
    const bulkOps = [];
    for (const item of purchase.items) {
      const product = productMap.get(String(item.productId));
      if (!product) continue;

      const wasSold = everSold.has(String(item.productId));
      summary.stockReversed.push({ name: product.name, qty: item.qty });

      if (wasSold) {
        summary.productsDeactivated.push(product.name);
        const newQty = Math.max(0, product.quantity - item.qty);
        bulkOps.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { quantity: newQty, isActive: false } },
          },
        });
        if (req.io) {
          req.io.emit('stock:updated', { productId: product._id.toString(), quantity: newQty, reservedQty: product.reservedQty });
        }
      } else {
        summary.productsDeleted.push(product.name);
        idsToDelete.push(product._id);
        if (req.io) {
          req.io.emit('product:deleted', { productId: product._id.toString() });
        }
      }
    }

    if (bulkOps.length) await Product.bulkWrite(bulkOps);
    if (idsToDelete.length) await Product.deleteMany({ _id: { $in: idsToDelete } });
    await StockMovement.deleteMany({ transactionId: purchase.purchaseId });

    // Reverse supplier balance
    if (purchase.supplierId) {
      await Supplier.findByIdAndUpdate(purchase.supplierId, {
        $inc: { balance: -purchase.totalCost },
      });
    }

    await Purchase.findByIdAndDelete(purchase._id);

    res.json({ message: 'Purchase deleted and stock reversed', summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Looks up the owning purchase + item + sold status for one scanned barcode,
// for the Purchase list's "Scan & Delete Units" queue — lets the cashier see
// what a barcode is before committing to delete it.
exports.getUnitByBarcode = async (req, res) => {
  try {
    const { barcode } = req.query;
    if (!barcode) return res.status(400).json({ message: 'barcode is required' });
    const trimmed = barcode.trim();

    const purchase = await Purchase.findOne({ 'items.barcode': trimmed });
    if (!purchase) return res.status(404).json({ message: `No purchase unit found with barcode ${trimmed}` });

    const itemIndex = purchase.items.findIndex((it) => it.barcode === trimmed);
    const item = purchase.items[itemIndex];
    const product = await Product.findById(item.productId).select('quantity isActive');

    res.json({
      purchaseId: purchase._id,
      purchaseNumber: purchase.purchaseId,
      itemIndex,
      barcode: trimmed,
      productName: item.name,
      isSold: product ? product.quantity === 0 : false,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deletes specific scanned units (by barcode) rather than a whole purchase.
// Applies the exact same never-sold-hard-delete / sold-deactivate rule as
// deletePurchase, but scoped per-item — grouped by owning purchase so each
// purchase's totalCost is recalculated once and empty purchases are removed.
exports.deleteUnits = async (req, res) => {
  try {
    const { barcodes } = req.body;
    if (!Array.isArray(barcodes) || !barcodes.length)
      return res.status(400).json({ message: 'barcodes array is required' });

    const trimmed = [...new Set(barcodes.map((b) => (b || '').toString().trim()).filter(Boolean))];
    const summary = { deleted: [], deactivated: [], notFound: [] };

    // Group barcodes by owning purchase so each purchase is touched once.
    const purchases = await Purchase.find({ 'items.barcode': { $in: trimmed } });
    const foundBarcodes = new Set();

    for (const purchase of purchases) {
      const targetIndices = [];
      purchase.items.forEach((it, idx) => {
        if (trimmed.includes(it.barcode)) { targetIndices.push(idx); foundBarcodes.add(it.barcode); }
      });
      if (!targetIndices.length) continue;

      const productIds = targetIndices.map((idx) => purchase.items[idx].productId);
      const products = await Product.find({ _id: { $in: productIds } });
      const productMap = new Map(products.map((p) => [String(p._id), p]));

      const [soldInStore, soldOnline] = await Promise.all([
        SaleTransaction.find({ 'items.productId': { $in: productIds } }, { 'items.productId': 1 }),
        Order.find({ 'items.productId': { $in: productIds } }, { 'items.productId': 1 }),
      ]);
      const everSold = new Set();
      soldInStore.forEach((s) => s.items.forEach((it) => everSold.add(String(it.productId))));
      soldOnline.forEach((o) => o.items.forEach((it) => everSold.add(String(it.productId))));

      const idxToRemove = [];
      const idsToDelete = [];
      const bulkOps = [];

      for (const idx of targetIndices) {
        const item = purchase.items[idx];
        const product = productMap.get(String(item.productId));
        if (!product) continue;

        const wasSold = everSold.has(String(item.productId));
        if (wasSold) {
          summary.deactivated.push({ barcode: item.barcode, name: product.name });
          const newQty = Math.max(0, product.quantity - item.qty);
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { quantity: newQty, isActive: false } } } });
          if (req.io) req.io.emit('stock:updated', { productId: product._id.toString(), quantity: newQty, reservedQty: product.reservedQty });
        } else {
          summary.deleted.push({ barcode: item.barcode, name: product.name });
          idsToDelete.push(product._id);
          idxToRemove.push(idx); // only never-sold units actually leave the purchase's item list
          if (req.io) req.io.emit('product:deleted', { productId: product._id.toString() });
        }
      }

      if (bulkOps.length) await Product.bulkWrite(bulkOps);
      if (idsToDelete.length) await Product.deleteMany({ _id: { $in: idsToDelete } });
      if (idxToRemove.length) {
        await StockMovement.deleteMany({ productId: { $in: idsToDelete } });
        const removeSet = new Set(idxToRemove);
        purchase.items = purchase.items.filter((_, idx) => !removeSet.has(idx));
      }

      purchase.totalCost = purchase.items.reduce((s, it) => s + it.qty * it.costPrice, 0);

      if (purchase.items.length === 0) {
        if (purchase.supplierId) {
          await Supplier.findByIdAndUpdate(purchase.supplierId, { $inc: { balance: -purchase.totalCost } });
        }
        await Purchase.findByIdAndDelete(purchase._id);
      } else {
        await purchase.save();
      }
    }

    trimmed.forEach((b) => { if (!foundBarcodes.has(b)) summary.notFound.push(b); });

    res.json({ message: 'Scanned units processed', summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.findPurchaseByBarcode = async (req, res) => {
  try {
    const { barcode } = req.query;
    if (!barcode) return res.status(400).json({ message: 'barcode is required' });
    const purchase = await Purchase.findOne({ 'items.barcode': barcode.trim() })
      .populate('purchasedBy', 'name email')
      .populate('supplierId', 'name phone email');
    if (!purchase) return res.status(404).json({ message: 'No purchase found with this barcode' });
    res.json({ purchase });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listPurchases = async (req, res) => {
  try {
    const { startDate, endDate, supplier, supplierId, page = 1, limit = 20 } = req.query;
    const query = {};

    if (supplierId) query.supplierId = supplierId;
    else if (supplier) query.supplier = { $regex: supplier, $options: 'i' };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [purchases, total] = await Promise.all([
      Purchase.find(query)
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .populate('purchasedBy', 'name email')
        .populate('supplierId', 'name phone'),
      Purchase.countDocuments(query),
    ]);

    res.json({ purchases, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('purchasedBy', 'name email')
      .populate('supplierId', 'name phone email');
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    // Annotate each item with isSold flag and fill barcode from product if not saved on item
    const productIds = purchase.items.map((it) => it.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } }).select('_id quantity barcode');
    const productMap = {};
    products.forEach((p) => { productMap[String(p._id)] = p; });

    const obj = purchase.toObject();
    obj.items = obj.items.map((it) => {
      const prod = productMap[String(it.productId)];
      return {
        ...it,
        barcode: it.barcode || prod?.barcode || '',
        isSold: prod ? prod.quantity === 0 : false,
      };
    });

    res.json({ purchase: obj });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
