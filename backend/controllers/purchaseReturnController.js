const { v4: uuidv4 } = require('uuid');
const PurchaseReturn = require('../models/PurchaseReturn');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const StockMovement = require('../models/StockMovement');

exports.createPurchaseReturn = async (req, res) => {
  try {
    const { purchaseId, items, reason, note } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'At least one item is required' });

    const purchase = await Purchase.findById(purchaseId).populate('supplierId', 'name');
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    let totalRefund = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ message: `Product ${item.productId} not found` });

      const qty = Number(item.qty);
      if (qty > product.quantity) {
        return res.status(400).json({ message: `Cannot return ${qty} of "${product.name}" — only ${product.quantity} in stock` });
      }

      const prev = product.quantity;
      product.quantity -= qty;
      await product.save();

      await StockMovement.create({
        productId: product._id,
        type: 'ADJUSTMENT',
        channel: 'SYSTEM',
        quantityChanged: -qty,
        previousQty: prev,
        newQty: product.quantity,
        note: `Purchase return — original: ${purchase.purchaseId}`,
        performedBy: req.user._id,
        transactionId: purchase.purchaseId,
      });

      req.io.emit('stock:updated', { productId: product._id.toString(), quantity: product.quantity, reservedQty: product.reservedQty });

      const costPrice = item.costPrice ?? product.costPrice;
      resolvedItems.push({ productId: product._id, name: product.name, qty, costPrice, color: product.color, size: product.size });
      totalRefund += costPrice * qty;
    }

    const returnId = `PRET-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;

    const purchaseReturn = await PurchaseReturn.create({
      returnId,
      originalPurchaseId: purchase._id,
      originalPurchaseRef: purchase.purchaseId,
      supplierId: purchase.supplierId?._id || purchase.supplierId || null,
      supplier: purchase.supplier || '',
      items: resolvedItems,
      totalRefund,
      reason: reason || '',
      note: note || '',
      processedBy: req.user._id,
    });

    // Reduce supplier balance (they owe us less now)
    if (purchase.supplierId) {
      await Supplier.findByIdAndUpdate(purchase.supplierId, { $inc: { balance: -totalRefund } });
    }

    res.status(201).json({ purchaseReturn });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listPurchaseReturns = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [returns, total] = await Promise.all([
      PurchaseReturn.find().sort('-createdAt').skip(skip).limit(Number(limit)).populate('processedBy', 'name'),
      PurchaseReturn.countDocuments(),
    ]);
    res.json({ returns, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
