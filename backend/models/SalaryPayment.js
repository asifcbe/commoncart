const mongoose = require('mongoose');

const salaryPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    // Period the payment covers, e.g. 'June 2026'
    periodLabel: { type: String, default: '' },
    method: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'], default: 'CASH' },
    type: { type: String, enum: ['SALARY', 'ADVANCE', 'BONUS', 'DEDUCTION'], default: 'SALARY' },
    note: { type: String, default: '' },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salaryPaymentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SalaryPayment', salaryPaymentSchema);
