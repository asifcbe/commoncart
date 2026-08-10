const Coupon = require('../models/Coupon');

// Shared utility used by sale/order controllers
const computeCouponDiscount = (coupon, subtotal) => {
  if (coupon.type === 'PERCENTAGE') {
    let discount = (subtotal * coupon.value) / 100;
    if (coupon.maxDiscountAmount > 0) discount = Math.min(discount, coupon.maxDiscountAmount);
    return Math.round(discount * 100) / 100;
  }
  return Math.min(coupon.value, subtotal);
};

exports.computeCouponDiscount = computeCouponDiscount;

exports.validateAndGetCoupon = async (code, subtotal) => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw { status: 400, message: `Coupon "${code}" is invalid or inactive` };
  if (coupon.expiresAt && new Date() > coupon.expiresAt) throw { status: 400, message: 'Coupon has expired' };
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) throw { status: 400, message: 'Coupon usage limit reached' };
  if (subtotal < coupon.minOrderAmount) throw { status: 400, message: `Minimum order amount for this coupon is ${coupon.minOrderAmount}` };
  return { coupon, discount: computeCouponDiscount(coupon, subtotal) };
};

exports.validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.query;
    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    const { coupon, discount } = await exports.validateAndGetCoupon(code, Number(subtotal) || 0);
    res.json({ valid: true, discount, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ valid: false, message: err.message });
    res.status(500).json({ message: err.message });
  }
};

exports.listCoupons = async (req, res) => {
  try {
    const { isActive, page = 1, limit = 50 } = req.query;
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    const skip = (Number(page) - 1) * Number(limit);
    const [coupons, total] = await Promise.all([
      Coupon.find(query).sort('-createdAt').skip(skip).limit(Number(limit)),
      Coupon.countDocuments(query),
    ]);
    res.json({ coupons, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const { code, description, type, value, minOrderAmount, maxDiscountAmount, maxUses, expiresAt } = req.body;
    if (!code || !type || value === undefined) return res.status(400).json({ message: 'code, type and value are required' });

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      description,
      type,
      value: Number(value),
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscountAmount: Number(maxDiscountAmount) || 0,
      maxUses: Number(maxUses) || 0,
      expiresAt: expiresAt || null,
      createdBy: req.user._id,
    });
    res.status(201).json({ coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Coupon code already exists' });
    res.status(500).json({ message: err.message });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.usedCount;
    if (updates.code) updates.code = updates.code.toUpperCase().trim();
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ coupon });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
