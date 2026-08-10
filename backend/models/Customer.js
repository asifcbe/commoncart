const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home' },
    fullName: { type: String, required: true },
    phone: { type: String },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: 'US' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    phone: { type: String, default: '', trim: true },
    addresses: [addressSchema],
    isActive: { type: Boolean, default: true },
    creditPoints: { type: Number, default: 0, min: 0 },
    // Rupee-denominated store credit from return/exchange settlements — kept
    // separate from creditPoints (loyalty points, points-per-rupee conversion)
    // to avoid mixing the two unit systems.
    storeCredit: { type: Number, default: 0, min: 0 },
    source: { type: String, enum: ['WEB', 'POS'], default: 'WEB' },
  },
  { timestamps: true }
);

customerSchema.index({ phone: 1 }, { sparse: true });

customerSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

customerSchema.statics.hashPassword = async (password) => bcrypt.hash(password, 12);

module.exports = mongoose.model('Customer', customerSchema);
