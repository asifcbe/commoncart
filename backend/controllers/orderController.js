const { withUniqueDocNumber } = require('../utils/invoiceNumber');
const Order = require('../models/Order');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Customer = require('../models/Customer');
const AppSettings = require('../models/AppSettings');
const Coupon = require('../models/Coupon');
const { validateAndGetCoupon } = require('./couponController');

const DEFAULT_CREDIT = { rupeesPerPoint: 1000, pointValue: 1 };

// Reserve stock when order is placed (qty goes to reservedQty)
const reserveStock = async (items, io) => {
  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) throw { status: 404, message: `Product ${item.productId} not found` };

    const available = product.quantity - product.reservedQty;
    if (available < item.qty) {
      throw {
        status: 409,
        message: `Insufficient stock for "${product.name}". Available: ${available}`,
        productId: product._id,
        productName: product.name,
        available,
      };
    }
    product.reservedQty += item.qty;
    await product.save();
    io.emit('stock:updated', { productId: product._id.toString(), quantity: product.quantity, reservedQty: product.reservedQty });
  }
};

// Deduct stock when order is confirmed/paid
const deductStock = async (order, io) => {
  for (const item of order.items) {
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const previousQty = product.quantity;
    product.quantity = Math.max(0, product.quantity - item.qty);
    product.reservedQty = Math.max(0, product.reservedQty - item.qty);
    await product.save();

    await StockMovement.create({
      productId: item.productId,
      type: 'SALE',
      channel: 'WEB',
      quantityChanged: -item.qty,
      previousQty,
      newQty: product.quantity,
      note: `Web order ${order.orderId}`,
      transactionId: order.orderId,
    });

    io.emit('stock:updated', { productId: product._id.toString(), quantity: product.quantity, reservedQty: product.reservedQty });
  }
};

// Release reserved stock on cancellation
const releaseStock = async (items, io) => {
  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) continue;
    product.reservedQty = Math.max(0, product.reservedQty - item.qty);
    await product.save();
    io.emit('stock:updated', { productId: product._id.toString(), quantity: product.quantity, reservedQty: product.reservedQty });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, note, shippingCost = 0, couponCode, redeemPoints } = req.body;

    if (!items?.length) return res.status(400).json({ message: 'Order must have at least one item' });
    if (!shippingAddress) return res.status(400).json({ message: 'Shipping address is required' });

    // Resolve items with current prices
    const resolvedItems = [];
    let subtotal = 0;
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive)
        return res.status(404).json({ message: `Product not found: ${item.productId}` });

      resolvedItems.push({
        productId: product._id,
        name: product.name,
        barcode: product.barcode,
        price: product.price,
        qty: item.qty,
        image: product.images?.[0] || '',
      });
      subtotal += product.price * item.qty;
    }

    // Coupon + credit points
    const creditConfig = await AppSettings.get('CREDIT_CONFIG', DEFAULT_CREDIT);
    let discountAmount = 0;
    let appliedCouponCode = '';
    let appliedCoupon = null;
    let pointsRedeemed = 0;

    if (couponCode && couponCode.trim()) {
      try {
        const result = await validateAndGetCoupon(couponCode.trim(), subtotal);
        appliedCoupon = result.coupon;
        discountAmount += result.discount;
        appliedCouponCode = result.coupon.code;
      } catch (err) {
        return res.status(err.status || 400).json({ message: err.message });
      }
    }

    const webCustomer = await Customer.findById(req.customer._id);
    if (redeemPoints && Number(redeemPoints) > 0) {
      const pointsToRedeem = Math.min(Number(redeemPoints), webCustomer.creditPoints);
      discountAmount += pointsToRedeem * creditConfig.pointValue;
      pointsRedeemed = pointsToRedeem;
    }

    discountAmount = Math.min(discountAmount, subtotal);
    const discountedSubtotal = subtotal - discountAmount;

    // Reserve stock (throws on insufficient stock)
    await reserveStock(resolvedItems, req.io);

    const totalAmount = discountedSubtotal + Number(shippingCost);

    // Deduct redeemed points immediately on placement
    if (pointsRedeemed > 0) {
      webCustomer.creditPoints = Math.max(0, webCustomer.creditPoints - pointsRedeemed);
      await webCustomer.save();
    }
    if (appliedCoupon) {
      await Coupon.findByIdAndUpdate(appliedCoupon._id, { $inc: { usedCount: 1 } });
    }

    // withUniqueDocNumber retries with a fresh orderId if the ORD counter has
    // drifted behind an existing document (self-heals instead of failing the
    // order after stock was already reserved above).
    const order = await withUniqueDocNumber('ORD', (orderId) => Order.create({
      orderId,
      customerId: req.customer._id,
      items: resolvedItems,
      shippingAddress,
      subtotal,
      shippingCost: Number(shippingCost),
      totalAmount,
      paymentMethod: paymentMethod || 'COD',
      note: note || '',
      couponCode: appliedCouponCode,
      discountAmount,
      creditPointsRedeemed: pointsRedeemed,
      stockReserved: true,
      stockDeducted: false,
    }));

    req.io.emit('order:new', {
      orderId: order.orderId,
      customerId: req.customer._id,
      totalAmount,
      itemCount: resolvedItems.length,
    });

    res.status(201).json({ order });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, ...err });
    res.status(500).json({ message: err.message });
  }
};

exports.confirmOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.paymentStatus === 'PAID') return res.status(400).json({ message: 'Already confirmed' });

    order.paymentStatus = 'PAID';
    order.fulfillmentStatus = 'PROCESSING';

    if (!order.stockDeducted) {
      await deductStock(order, req.io);
      order.stockDeducted = true;
      order.stockReserved = false;
    }

    // Award credit points on payment confirmation
    if (!order.creditPointsEarned) {
      const creditConfig = await AppSettings.get('CREDIT_CONFIG', DEFAULT_CREDIT);
      const pointsEarned = Math.floor(order.totalAmount / creditConfig.rupeesPerPoint);
      if (pointsEarned > 0) {
        order.creditPointsEarned = pointsEarned;
        await Customer.findByIdAndUpdate(order.customerId, { $inc: { creditPoints: pointsEarned } });
      }
    }

    await order.save();
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.fulfillmentStatus === 'DELIVERED')
      return res.status(400).json({ message: 'Cannot cancel a delivered order' });

    if (order.stockReserved && !order.stockDeducted) {
      await releaseStock(order.items, req.io);
    }

    // Refund redeemed points on cancellation
    if (order.creditPointsRedeemed > 0) {
      await Customer.findByIdAndUpdate(order.customerId, { $inc: { creditPoints: order.creditPointsRedeemed } });
    }

    order.fulfillmentStatus = 'CANCELLED';
    order.paymentStatus = order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus;
    order.stockReserved = false;
    await order.save();

    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFulfillment = async (req, res) => {
  try {
    const { fulfillmentStatus } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { fulfillmentStatus },
      { new: true }
    ).populate('customerId', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.myOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find({ customerId: req.customer._id }).sort('-createdAt').skip(skip).limit(Number(limit)),
      Order.countDocuments({ customerId: req.customer._id }),
    ]);
    res.json({ orders, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.myOrderDetail = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customerId: req.customer._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.adminGetOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customerId', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const wasUnpaid = order.paymentStatus !== 'PAID';
    order.paymentStatus = paymentStatus;

    if (paymentStatus === 'PAID' && wasUnpaid && !order.stockDeducted) {
      await deductStock(order, req.io);
      order.stockDeducted = true;
      order.stockReserved = false;
      if (order.fulfillmentStatus === 'PENDING') order.fulfillmentStatus = 'PROCESSING';
    }

    await order.save();
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.adminListOrders = async (req, res) => {
  try {
    const { fulfillmentStatus, paymentStatus, page = 1, limit = 20 } = req.query;
    const query = {};
    if (fulfillmentStatus) query.fulfillmentStatus = fulfillmentStatus;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .populate('customerId', 'name email phone'),
      Order.countDocuments(query),
    ]);
    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.publicProducts = async (req, res) => {
  try {
    const { search, category, subCategory, color, size, page = 1, limit = 20, sort = '-createdAt', featured } = req.query;
    const query = { isActive: true, isWebVisible: true };
    if (category) query.category = category;
    if (subCategory) query.subCategory = subCategory;
    if (color) query.color = color;
    if (size) query.size = size;
    if (featured === 'true') query.quantity = { $gt: 0 };
    if (search) query.$text = { $search: search };

    // Filter facets are scoped to the selected category (or all web-visible
    // products when no category is picked), excluding blanks.
    const facetScope = { isActive: true, isWebVisible: true };
    if (category) facetScope.category = category;

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total, categories, subCategoriesRaw, colorsRaw, sizesRaw] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(Number(limit))
        .select('name description category subCategory color size SKU barcode price images quantity reservedQty lowStockThreshold'),
      Product.countDocuments(query),
      Product.distinct('category', { isActive: true, isWebVisible: true }),
      Product.distinct('subCategory', facetScope),
      Product.distinct('color', facetScope),
      Product.distinct('size', facetScope),
    ]);

    const subCategories = subCategoriesRaw.filter(Boolean).sort();
    const variants = colorsRaw.filter(Boolean).sort();
    const sizes = sizesRaw.filter(Boolean).sort();

    const enriched = products.map((p) => ({
      ...p.toObject(),
      availableQty: Math.max(0, p.quantity - p.reservedQty),
    }));

    res.json({ products: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)), categories, subCategories, variants, sizes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.publicProductDetail = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isActive: true, isWebVisible: true })
      .select('name description category subCategory color size SKU barcode price images quantity reservedQty lowStockThreshold supplier location');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const data = product.toObject();
    data.availableQty = Math.max(0, product.quantity - product.reservedQty);
    res.json({ product: data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
