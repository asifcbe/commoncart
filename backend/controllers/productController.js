const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const generateSKU = require('../utils/generateSKU');
const { generateEAN13 } = require('../utils/generateBarcode');
const { deleteProductImageFiles } = require('../utils/productImages');

exports.listProducts = async (req, res) => {
  try {
    const { search, category, subCategory, color, size, page = 1, limit = 20, sort = '-createdAt', isActive } = req.query;

    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (category) query.category = category;
    if (subCategory) query.subCategory = subCategory;
    if (color) query.color = color;
    if (size) query.size = size;
    if (search) query.$text = { $search: search };

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
    const { name, description, category, subCategory, color, size, price, costPrice, quantity, supplier, location, lowStockThreshold, isWebVisible, hsnCode, gstPercent } = req.body;
    const providedBarcode = (req.body.barcode || '').trim();
    const providedSKU = (req.body.SKU || '').trim();

    if (!name || !category || price === undefined)
      return res.status(400).json({ message: 'name, category and price are required' });

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

    const product = await Product.create({
      name, description, category, subCategory: (subCategory || '').trim(),
      color: (color || '').trim(), size: (size || '').trim(),
      price: Number(price),
      costPrice: Number(costPrice) || 0,
      quantity: Number(quantity) || 0,
      supplier, location,
      lowStockThreshold: Number(lowStockThreshold) || 10,
      // Hidden from the web store by default — only visible when explicitly enabled
      isWebVisible: isWebVisible === true || isWebVisible === 'true',
      hsnCode: (hsnCode || '').trim(),
      gstPercent: gstPercent === '' || gstPercent == null ? null : Math.max(0, Math.min(100, Number(gstPercent))),
      SKU, barcode, images,
    });

    res.status(201).json({ product });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    // Unlike hsnCode (a String field where '' is valid), gstPercent is a
    // Number field — an empty-string value from the form must become null
    // ("use shop default"), not fail Mongoose's Number cast.
    if (updates.gstPercent === '') updates.gstPercent = null;

    // If new images are uploaded they replace the old ones — capture old set to clean up
    let oldImages = [];
    if (req.files && req.files.length > 0) {
      const existing = await Product.findById(req.params.id).select('images');
      oldImages = existing?.images || [];
      updates.images = req.files.map((f) => `/uploads/products/${f.filename}`);
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Delete the now-replaced image files from disk
    if (oldImages.length) deleteProductImageFiles(oldImages);

    res.json({ product });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
