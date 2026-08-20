const { withUniqueDocNumber } = require('../utils/invoiceNumber');
const { getGstSnapshot } = require('../utils/gstSnapshot');
const { getConsumedQtyByProduct } = require('./returnSessionController');
const SaleTransaction = require('../models/SaleTransaction');
const Order = require('../models/Order');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Customer = require('../models/Customer');
const AppSettings = require('../models/AppSettings');
const Settlement = require('../models/Settlement');
const { validateAndGetCoupon } = require('./couponController');

const DEFAULT_CREDIT = { rupeesPerPoint: 1000, pointValue: 1 };

exports.processStoreSale = async (req, res) => {
  try {
    const { items, paymentMethod, splitPayments, note, customerPhone, customerName, couponCode, redeemPoints, redeemEarnedNow, soldBy, manualDiscount, roundOff, carryForward } = req.body;

    if (!items || !items.length)
      return res.status(400).json({ message: 'At least one item is required' });

    const resolvedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ message: `Product ${item.productId} not found` });

      const available = product.quantity - product.reservedQty;
      if (available < item.qty) {
        return res.status(409).json({
          message: `Insufficient stock for ${product.name}`,
          conflict: true,
          product: { id: product._id, name: product.name, available },
        });
      }

      const effectivePrice = product.discountPrice != null ? product.discountPrice : product.price;
      resolvedItems.push({
        productId: product._id,
        barcode: product.barcode,
        name: product.name,
        qty: item.qty,
        price: effectivePrice,
        // isDiscounted here means "aged" → blocks return/exchange. Manual discounts stay exchangeable.
        isDiscounted: !!product.isAged,
      });

      totalAmount += effectivePrice * item.qty;
    }

    // --- Loyalty & coupon logic ---
    const creditConfig = await AppSettings.get('CREDIT_CONFIG', DEFAULT_CREDIT);
    let discountAmount = 0;
    let appliedCouponCode = '';
    let appliedCoupon = null;
    let customer = null;
    let pointsRedeemed = 0;

    // Look up customer by phone
    if (customerPhone && customerPhone.trim()) {
      customer = await Customer.findOne({ phone: customerPhone.trim() });
    }

    // Apply coupon
    if (couponCode && couponCode.trim()) {
      try {
        const result = await validateAndGetCoupon(couponCode.trim(), totalAmount);
        appliedCoupon = result.coupon;
        discountAmount += result.discount;
        appliedCouponCode = result.coupon.code;
      } catch (err) {
        return res.status(err.status || 400).json({ message: err.message });
      }
    }

    // Redeem credit points already on the customer's balance (from past visits).
    // Tracked separately from `pointsRedeemed` (the bill-level total used for
    // display/reversal) because only *this* portion actually needs deducting
    // from customer.creditPoints below — earned-and-redeemed-now points never
    // touched the balance, so they must not be subtracted from it too.
    let pointsRedeemedFromBalance = 0;
    if (customer && redeemPoints && Number(redeemPoints) > 0) {
      const pointsToRedeem = Math.min(Number(redeemPoints), customer.creditPoints);
      const pointDiscount = pointsToRedeem * creditConfig.pointValue;
      discountAmount += pointDiscount;
      pointsRedeemed = pointsToRedeem;
      pointsRedeemedFromBalance = pointsToRedeem;
    }

    // Manual discount (flat ₹ amount already computed on the frontend)
    if (manualDiscount && Number(manualDiscount) > 0) {
      discountAmount += Math.min(Number(manualDiscount), totalAmount - discountAmount);
    }

    discountAmount = Math.min(discountAmount, totalAmount);

    // Points earned are based on what the customer actually pays for goods —
    // coupon, points-redeemed(from balance), and manual discount all reduce
    // the qualifying amount. Round-off/carry-forward don't (they're not goods
    // value). Computed before the redeem-now discount below, which is itself
    // derived from pointsEarned — including it here would be circular.
    const pointsEarned = Math.floor(Math.max(0, totalAmount - discountAmount) / creditConfig.rupeesPerPoint);
    // Opt-in: spend those just-earned points on this same bill instead of banking
    // them to the customer's balance for a future visit. They never touch
    // customer.creditPoints in this case — earned and spent in the same transaction.
    let pointsEarnedRedeemedNow = 0;
    if (customer && redeemEarnedNow && pointsEarned > 0) {
      pointsEarnedRedeemedNow = pointsEarned;
      discountAmount += pointsEarned * creditConfig.pointValue;
      pointsRedeemed += pointsEarned;
    }

    discountAmount = Math.min(discountAmount, totalAmount);
    const preRound = Math.max(0, totalAmount - discountAmount);
    // Round-off adjustment (positive = add, negative = subtract — already computed on frontend)
    const roundOffAdj = roundOff ? Number(roundOff) : 0;
    // `totalAmount` on the saved document stays goods-only (GST is computed
    // from it at render/print time) — the carried-forward settlement from a
    // prior return/exchange session is a non-taxable cash adjustment applied
    // on top, so it must never feed into the GST base.
    const finalAmount = preRound + roundOffAdj;
    // Positive = customer owes more, negative = shop owes customer. Purely a
    // payable-amount adjustment; may make the amount collected at checkout
    // negative (shop refunds the customer cash instead of collecting payment).
    const carriedAmount = carryForward?.amount ? Number(carryForward.amount) : 0;
    const amountDue = finalAmount + carriedAmount;

    // Split payment: validate the entered amounts actually cover the bill.
    let resolvedSplitPayments;
    if (Array.isArray(splitPayments) && splitPayments.length > 0) {
      resolvedSplitPayments = splitPayments
        .map((p) => ({ method: (p.method || '').toString().trim() || 'OTHER', amount: Number(p.amount) || 0 }))
        .filter((p) => p.amount > 0);
      const splitTotal = resolvedSplitPayments.reduce((s, p) => s + p.amount, 0);
      if (resolvedSplitPayments.length && Math.abs(splitTotal - amountDue) > 0.01) {
        return res.status(400).json({ message: `Split payment total ₹${splitTotal.toFixed(2)} does not match amount due ₹${amountDue.toFixed(2)}` });
      }
    }

    const gst = await getGstSnapshot();

    // Attribute the sale to a chosen staff member if provided (defaults to the logged-in user)
    let soldByUser = req.user._id;
    if (soldBy && soldBy !== String(req.user._id)) {
      const User = require('../models/User');
      const staff = await User.findById(soldBy).select('_id');
      if (staff) soldByUser = staff._id;
    }

    // withUniqueDocNumber retries with a fresh transactionId if the INV
    // counter has drifted behind an existing document (self-heals instead of
    // failing checkout on a stale counter).
    const transaction = await withUniqueDocNumber('INV', (transactionId) => SaleTransaction.create({
      transactionId,
      channel: 'STORE',
      items: resolvedItems,
      totalAmount: finalAmount,
      paymentMethod: (resolvedSplitPayments?.length ? resolvedSplitPayments[0].method : paymentMethod) || 'CASH',
      splitPayments: resolvedSplitPayments?.length ? resolvedSplitPayments : undefined,
      status: 'COMPLETED',
      soldBy: soldByUser,
      customerId: customer?._id || null,
      customerPhone: customerPhone || '',
      customerName: customer?.name || (customerName || '').trim(),
      couponCode: appliedCouponCode,
      discountAmount,
      roundOffAmount: roundOffAdj,
      creditPointsEarned: pointsEarned,
      creditPointsRedeemed: pointsRedeemed,
      note: note || '',
      gst,
      carriedSettlement: carriedAmount
        ? { amount: carriedAmount, sourceLabel: carryForward?.sourceLabel || '', settlementId: carryForward?.settlementId || null }
        : undefined,
    }));
    const transactionId = transaction.transactionId;

    for (const item of resolvedItems) {
      const product = await Product.findById(item.productId);
      const previousQty = product.quantity;
      product.quantity -= item.qty;
      await product.save();

      await StockMovement.create({
        productId: item.productId,
        type: 'SALE',
        channel: 'STORE',
        quantityChanged: -item.qty,
        previousQty,
        newQty: product.quantity,
        note: `POS Sale ${transactionId}`,
        performedBy: req.user._id,
        transactionId,
      });

      req.io.emit('stock:updated', { productId: item.productId.toString(), quantity: product.quantity, reservedQty: product.reservedQty });
    }

    // Apply loyalty points changes to the balance:
    //  - subtract only points actually redeemed FROM the balance (not
    //    earned-and-redeemed-now points — those were never in the balance,
    //    so they must never be subtracted from it; that was the bug where a
    //    100-point customer using "Redeem Now" saw their balance drop by the
    //    bill's own just-earned points instead of staying untouched)
    //  - add only points earned that WEREN'T redeemed now (banked for later)
    if (customer) {
      const pointsToBank = pointsEarned - pointsEarnedRedeemedNow;
      customer.creditPoints = Math.max(0, customer.creditPoints - pointsRedeemedFromBalance) + pointsToBank;
      await customer.save();
    }
    if (appliedCoupon) {
      const Coupon = require('../models/Coupon');
      await Coupon.findByIdAndUpdate(appliedCoupon._id, { $inc: { usedCount: 1 } });
    }

    // Notify dashboards (Sales History, Dashboard) that a new store sale was recorded
    req.io.emit('sale:created', { transactionId, channel: 'STORE', totalAmount: finalAmount });

    res.status(201).json({
      transaction,
      pointsEarned,
      pointsRedeemed,
      // Rupee value of `pointsRedeemed` (points aren't always worth ₹1 each —
      // see CREDIT_CONFIG.pointValue). Lets receipts show a "Points Redeemed"
      // line in rupees without assuming a 1:1 conversion, and lets them show
      // a "Discount" line that excludes this amount instead of double-listing
      // it (discountAmount already has the points' rupee value folded in).
      pointsRedeemedValue: pointsRedeemed * creditConfig.pointValue,
      pointsEarnedRedeemedNow,
      discountAmount,
      customer: customer
        ? { name: customer.name, phone: customer.phone, creditPoints: customer.creditPoints }
        : (transaction.customerName ? { name: transaction.customerName, phone: '', creditPoints: null } : null),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Unified sales list — merges SaleTransactions (STORE) and Orders (WEB) into one feed.
 * channel filter: 'STORE' = POS only, 'WEB' = web orders only, blank = both
 */
exports.listSales = async (req, res) => {
  try {
    const { channel, startDate, endDate, soldBy, search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    // Search by customer phone or name — case-insensitive partial match.
    const searchTerm = (search || '').trim();
    let matchingCustomerIds = null;
    if (searchTerm) {
      matchingCustomerIds = await Customer.find(
        { $or: [{ phone: { $regex: searchTerm, $options: 'i' } }, { name: { $regex: searchTerm, $options: 'i' } }] },
        '_id'
      ).lean().then((rows) => rows.map((r) => r._id));
    }

    let combined = [];

    // STORE transactions
    if (!channel || channel === 'STORE') {
      const storeQuery = { ...dateFilter };
      if (soldBy) storeQuery.soldBy = soldBy;
      if (searchTerm) {
        storeQuery.$or = [
          { customerPhone: { $regex: searchTerm, $options: 'i' } },
          { customerName: { $regex: searchTerm, $options: 'i' } },
          { customerId: { $in: matchingCustomerIds } },
        ];
      }
      const storeSales = await SaleTransaction.find(storeQuery)
        .sort('-createdAt')
        .populate('soldBy', 'name email')
        .lean();

      combined.push(
        ...storeSales.map((s) => ({
          _id: s._id,
          transactionId: s.transactionId,
          channel: 'STORE',
          items: s.items,
          totalAmount: s.totalAmount,
          paymentMethod: s.paymentMethod,
          status: s.status,
          note: s.note,
          soldBy: s.soldBy,
          customer: null,
          customerPhone: s.customerPhone,
          customerName: s.customerName,
          createdAt: s.createdAt,
          _type: 'transaction',
        }))
      );
    }

    // WEB orders
    if (!channel || channel === 'WEB') {
      const webQuery = { ...dateFilter };
      if (searchTerm) webQuery.customerId = { $in: matchingCustomerIds };
      const webOrders = await Order.find(webQuery)
        .sort('-createdAt')
        .populate('customerId', 'name email phone')
        .lean();

      combined.push(
        ...webOrders.map((o) => ({
          _id: o._id,
          transactionId: o.orderId,
          channel: 'WEB',
          items: o.items,
          totalAmount: o.totalAmount,
          paymentMethod: o.paymentMethod,
          status: o.paymentStatus === 'PAID' ? 'COMPLETED' : o.fulfillmentStatus === 'CANCELLED' ? 'REFUNDED' : 'PENDING',
          fulfillmentStatus: o.fulfillmentStatus,
          paymentStatus: o.paymentStatus,
          note: o.note,
          soldBy: null,
          customer: o.customerId,
          createdAt: o.createdAt,
          _type: 'order',
        }))
      );
    }

    // Sort merged list by date desc
    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = combined.length;
    const paginated = combined.slice(skip, skip + Number(limit));

    res.json({
      sales: paginated,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Look up a sale/order by its bill number (used by the barcode scanner in Sales).
// Returns the document _id and channel so the UI can open the detail preview.
exports.findByNumber = async (req, res) => {
  try {
    const raw = (req.params.number || '').trim();
    if (!raw) return res.status(400).json({ message: 'Bill number is required' });

    // Try store transaction first, then web order
    const txn = await SaleTransaction.findOne({ transactionId: raw }).select('_id');
    if (txn) return res.json({ _id: txn._id, channel: 'STORE' });

    const order = await Order.findOne({ orderId: raw }).select('_id');
    if (order) return res.json({ _id: order._id, channel: 'WEB' });

    return res.status(404).json({ message: `No bill found for "${raw}"` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Look up the sale/order that sold a given product barcode (used by the
// scanner in Sales History to jump straight from a scanned item to its bill).
// Most recent match wins if the barcode was ever reused.
exports.findByItemBarcode = async (req, res) => {
  try {
    const raw = (req.params.barcode || '').trim();
    if (!raw) return res.status(400).json({ message: 'Barcode is required' });

    const txn = await SaleTransaction.findOne({ 'items.barcode': raw }).sort('-createdAt').select('_id');
    if (txn) return res.json({ _id: txn._id, channel: 'STORE' });

    const order = await Order.findOne({ 'items.barcode': raw }).sort('-createdAt').select('_id');
    if (order) return res.json({ _id: order._id, channel: 'WEB' });

    return res.status(404).json({ message: `No bill found for item barcode "${raw}"` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Edit a STORE sale's metadata only (payment method, note, customer phone/name).
// Item/qty/price changes are never allowed here — the original invoice is
// never modified after creation. Use Return / Exchange / Replace for any
// item-level correction so GST and inventory stay consistent.
exports.updateSale = async (req, res) => {
  try {
    const { paymentMethod, note, customerPhone, customerName, items } = req.body;
    if (items !== undefined) {
      return res.status(400).json({ message: 'Item-level edits are no longer supported here — use Return / Exchange / Replace.' });
    }

    const sale = await SaleTransaction.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.channel !== 'STORE') return res.status(400).json({ message: 'Only in-store sales can be edited here' });
    if (sale.status === 'REFUNDED') return res.status(400).json({ message: 'Refunded sales cannot be edited' });

    // ── Metadata ──
    if (paymentMethod !== undefined) {
      const modesConfig = await AppSettings.get('PAYMENT_MODES_CONFIG', null);
      const allowed = (modesConfig?.modes?.length ? modesConfig.modes : [{ key: 'CASH' }, { key: 'CARD' }, { key: 'MOBILE' }, { key: 'OTHER' }]).map((m) => m.key);
      if (!allowed.includes(paymentMethod)) return res.status(400).json({ message: 'Invalid payment method' });
      sale.paymentMethod = paymentMethod;
    }
    if (note !== undefined) sale.note = note;
    if (customerName !== undefined) sale.customerName = (customerName || '').trim();
    if (customerPhone !== undefined) {
      const trimmed = (customerPhone || '').trim();
      sale.customerPhone = trimmed;
      if (trimmed) {
        const cust = await Customer.findOne({ phone: trimmed });
        sale.customerId = cust ? cust._id : null;
      } else {
        sale.customerId = null;
      }
    }

    await sale.save();

    const populated = await SaleTransaction.findById(sale._id)
      .populate('soldBy', 'name email')
      .populate('customerId', 'name email phone creditPoints');
    const obj = populated.toObject();
    obj.customer = obj.customerId || (obj.customerName ? { name: obj.customerName, phone: obj.customerPhone || '' } : null);
    res.json({ sale: obj });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSale = async (req, res) => {
  try {
    // Try SaleTransaction first, then Order
    const sale = await SaleTransaction.findById(req.params.id)
      .populate('soldBy', 'name email')
      .populate('customerId', 'name email phone creditPoints');
    if (sale) {
      const obj = sale.toObject();
      // expose populated loyalty customer under `customer`, falling back to the plain walk-in name
      obj.customer = obj.customerId || (obj.customerName ? { name: obj.customerName, phone: obj.customerPhone || '' } : null);
      // Cumulative returned/replaced qty per product, so the UI can cap
      // Return/Exchange/Replace qty steppers without a second round-trip.
      obj.consumedQtyByProduct = await getConsumedQtyByProduct(sale._id);
      return res.json({ sale: obj, _type: 'transaction' });
    }

    const order = await Order.findById(req.params.id).populate('customerId', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Sale not found' });

    res.json({
      sale: {
        _id: order._id,
        transactionId: order.orderId,
        channel: 'WEB',
        items: order.items,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        status: order.paymentStatus === 'PAID' ? 'COMPLETED' : order.fulfillmentStatus === 'CANCELLED' ? 'REFUNDED' : 'PENDING',
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
        note: order.note,
        customer: order.customerId,
        // Fall back to the phone captured in the shipping address if the account has none
        customerPhone: order.customerId?.phone || order.shippingAddress?.phone || '',
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
      },
      _type: 'order',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDashboardStats = async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalProducts,
      todayStoreSales,
      todayWebOrders,
      recentStoreSales,
      recentWebOrders,
      todayRefunds,
    ] = await Promise.all([
      Product.countDocuments({ isActive: true }),

      // Today's in-store POS sales
      SaleTransaction.aggregate([
        { $match: { createdAt: { $gte: today }, status: 'COMPLETED' } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
      ]),

      // Today's web orders (any non-cancelled)
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, fulfillmentStatus: { $ne: 'CANCELLED' } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
      ]),

      // Recent store sales
      SaleTransaction.find({ status: 'COMPLETED' })
        .sort('-createdAt')
        .limit(5)
        .populate('soldBy', 'name')
        .lean(),

      // Recent web orders
      Order.find({ fulfillmentStatus: { $ne: 'CANCELLED' } })
        .sort('-createdAt')
        .limit(5)
        .populate('customerId', 'name')
        .lean(),

      // Cash/card/mobile/other refunds paid out today (see getDayBook for the
      // full explanation) — subtracted below so "today's revenue" reflects
      // what's actually still in the till, not the gross pre-refund total.
      // STORE_CREDIT settlements never moved real money, so they're excluded.
      Settlement.find({ createdAt: { $gte: today }, direction: 'REFUND_TO_CUSTOMER', method: { $ne: 'STORE_CREDIT' } })
        .select('netAmount')
        .lean(),
    ]);

    // Same double-count guard as the Day Book: a refund already netted into
    // a later carry-forward sale (created today) is already reflected in
    // that sale's own totalAmount, so don't subtract it a second time here.
    const todaysCarriedSettlementIds = new Set(
      (await SaleTransaction.find({ createdAt: { $gte: today }, 'carriedSettlement.settlementId': { $ne: null } })
        .select('carriedSettlement.settlementId')
        .lean())
        .map((s) => String(s.carriedSettlement.settlementId))
    );
    const todayRefundTotal = todayRefunds
      .filter((r) => !todaysCarriedSettlementIds.has(String(r._id)))
      .reduce((sum, r) => sum + Math.abs(r.netAmount), 0);

    // Merge recent transactions
    const recentSales = [
      ...recentStoreSales.map((s) => ({
        _id: s._id,
        transactionId: s.transactionId,
        channel: 'STORE',
        totalAmount: s.totalAmount,
        status: s.status,
        soldBy: s.soldBy,
        customer: null,
        createdAt: s.createdAt,
      })),
      ...recentWebOrders.map((o) => ({
        _id: o._id,
        transactionId: o.orderId,
        channel: 'WEB',
        totalAmount: o.totalAmount,
        status: o.paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING',
        fulfillmentStatus: o.fulfillmentStatus,
        soldBy: null,
        customer: o.customerId,
        createdAt: o.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);

    const allProducts = await Product.find({ isActive: true }).lean();
    const inStock  = allProducts.filter((p) => p.quantity - p.reservedQty > p.lowStockThreshold).length;
    const lowStock = allProducts.filter((p) => p.quantity - p.reservedQty > 0 && p.quantity - p.reservedQty <= p.lowStockThreshold).length;
    const outOfStock = allProducts.filter((p) => p.quantity - p.reservedQty <= 0).length;

    const storeCount   = todayStoreSales[0]?.count   || 0;
    // Net of today's cash/card/mobile/other refunds — see todayRefundTotal
    // above. A gross-only figure here would overstate what's actually still
    // in the till whenever a return/exchange refund happened today.
    const storeRevenue = (todayStoreSales[0]?.revenue || 0) - todayRefundTotal;
    const webCount     = todayWebOrders[0]?.count     || 0;
    const webRevenue   = todayWebOrders[0]?.revenue   || 0;

    res.json({
      totalProducts,
      todaySalesCount:   storeCount + webCount,
      todayRevenue:      storeRevenue + webRevenue,
      todayStoreSales:   { count: storeCount, revenue: storeRevenue },
      todayWebOrders:    { count: webCount, revenue: webRevenue },
      todayRefundTotal,
      lowStockCount: lowStock,
      recentSales,
      stockHealth: { inStock, lowStock, outOfStock },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
