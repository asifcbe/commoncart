const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Product = require('../models/Product');
const SaleTransaction = require('../models/SaleTransaction');
const StockMovement = require('../models/StockMovement');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Purchase = require('../models/Purchase');
const Coupon = require('../models/Coupon');
const AppSettings = require('../models/AppSettings');
const Supplier = require('../models/Supplier');
const SaleReturn = require('../models/SaleReturn');
const Exchange = require('../models/Exchange');
const PurchaseReturn = require('../models/PurchaseReturn');
const Attendance = require('../models/Attendance');
const SalaryPayment = require('../models/SalaryPayment');
const Counter = require('../models/Counter');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Shape of the user object sent to the client (includes access permissions)
const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  permissions: u.permissions || {},
});

exports.register = async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const passwordHash = await User.hashPassword(password);

    const doc = { name, email, passwordHash, role: role || 'STAFF' };
    // Only STAFF carry granular permissions; sanitise to known section keys
    if (doc.role === 'STAFF' && permissions) {
      doc.permissions = {
        sections: Array.isArray(permissions.sections)
          ? permissions.sections.filter((s) => User.STAFF_SECTIONS.includes(s))
          : [...User.DEFAULT_STAFF_PERMISSIONS.sections],
        viewCostPrice: !!permissions.viewCostPrice,
        canManage: !!permissions.canManage,
      };
    }

    const user = await User.create(doc);

    const token = signToken(user._id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken(user._id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMe = async (req, res) => {
  res.json({ user: publicUser(req.user) });
};

// Re-verifies the logged-in user's own password without issuing a new token —
// used to confirm identity for an in-session sensitive action (e.g. unlocking
// the POS kiosk lock) without forcing a full logout/login.
exports.verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password is required' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ message: 'Not authorized' });
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Incorrect password' });

    res.json({ valid: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Canonical admin credentials that always survive a full reset
const RESET_ADMIN_EMAIL = 'admin@commoncart.com';
const RESET_ADMIN_PASSWORD = 'Admin@123';

// Remove all uploaded product image files from disk (keeps .gitkeep + the folder).
function clearProductImageFiles() {
  const dir = path.join(__dirname, '..', 'uploads', 'products');
  let removed = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    for (const file of fs.readdirSync(dir)) {
      if (file === '.gitkeep') continue;
      try { fs.unlinkSync(path.join(dir, file)); removed++; } catch { /* ignore individual failures */ }
    }
  } catch { /* ignore — DB reset already succeeded */ }
  return removed;
}

exports.resetAll = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password is required' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ message: 'Not authorized' });
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Incorrect password' });

    // Wipe EVERYTHING — including all users and counters.
    await Promise.all([
      Product.deleteMany({}),
      SaleTransaction.deleteMany({}),
      StockMovement.deleteMany({}),
      Order.deleteMany({}),
      Customer.deleteMany({}),
      Purchase.deleteMany({}),
      Supplier.deleteMany({}),
      SaleReturn.deleteMany({}),
      Exchange.deleteMany({}),
      PurchaseReturn.deleteMany({}),
      Attendance.deleteMany({}),
      SalaryPayment.deleteMany({}),
      Coupon.deleteMany({}),
      AppSettings.deleteMany({}),
      Counter.deleteMany({}),
      User.deleteMany({}),
    ]);

    // Remove uploaded product images from disk so nothing is left orphaned
    const imagesRemoved = clearProductImageFiles();

    // Recreate the single canonical admin so login always works afterwards,
    // regardless of which account triggered the reset.
    const passwordHash = await User.hashPassword(RESET_ADMIN_PASSWORD);
    await User.create({
      name: 'Admin',
      email: RESET_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    });

    res.json({
      message: `All data has been reset (${imagesRemoved} image file(s) removed). Log in with ${RESET_ADMIN_EMAIL} / ${RESET_ADMIN_PASSWORD}.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
