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
