const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    amount: { type: Number, required: true },
    method: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER'], default: 'CASH' },
    reference: { type: String, default: '' },
    note: { type: String, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    note: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    // Running balance: positive = we owe them, negative = they owe us
    balance: { type: Number, default: 0 },
    payments: [paymentSchema],
  },
  { timestamps: true }
);

supplierSchema.index({ name: 'text' });

module.exports = mongoose.model('Supplier', supplierSchema);
