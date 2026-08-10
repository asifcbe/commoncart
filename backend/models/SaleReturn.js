const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    isDiscounted: { type: Boolean, default: false },
  },
  { _id: false }
);

const saleReturnSchema = new mongoose.Schema(
  {
    returnId: { type: String, unique: true, required: true },
    originalTransactionId: { type: String, required: true },
    originalSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', required: true },
    items: [returnItemSchema],
    refundAmount: { type: Number, required: true },
    refundMethod: { type: String, enum: ['CASH', 'CARD', 'MOBILE', 'CREDIT', 'OTHER'], default: 'CASH' },
    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

saleReturnSchema.index({ originalTransactionId: 1 });
saleReturnSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SaleReturn', saleReturnSchema);
