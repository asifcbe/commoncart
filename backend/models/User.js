const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Sections a STAFF user can be granted access to (admins always see everything).
// `key` matches the route path; used by both the sidebar and route guard.
const STAFF_SECTIONS = [
  'dashboard', 'products', 'barcode', 'pos', 'purchases', 'suppliers',
  'aged-products', 'inventory', 'sales', 'web-orders', 'customers', 'coupons',
];

// A sensible default: staff can use the POS and see sales, nothing sensitive.
const DEFAULT_STAFF_PERMISSIONS = {
  sections: ['dashboard', 'pos', 'products', 'sales'],
  viewCostPrice: false, // hides cost price / profit figures when false
  canManage: false, // hides Edit/Delete actions (products, purchases, sales) when false
};

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'STAFF'], default: 'STAFF' },
    // HR fields (optional)
    phone: { type: String, default: '' },
    monthlySalary: { type: Number, default: 0 },
    joinDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    // Access control (applies to STAFF only; admins bypass all checks)
    permissions: {
      sections: { type: [String], default: () => [...DEFAULT_STAFF_PERMISSIONS.sections] },
      viewCostPrice: { type: Boolean, default: false },
      canManage: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = async function (password) {
  return bcrypt.hash(password, 12);
};

const User = mongoose.model('User', userSchema);
User.STAFF_SECTIONS = STAFF_SECTIONS;
User.DEFAULT_STAFF_PERMISSIONS = DEFAULT_STAFF_PERMISSIONS;
module.exports = User;
