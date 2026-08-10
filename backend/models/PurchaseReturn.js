const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema(
  {
    returnId: { type: String, unique: true, required: true },
    originalPurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
    originalPurchaseRef: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplier: { type: String, default: '' },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
        costPrice: { type: Number, required: true },
        color: { type: String, default: '' },
        size: { type: String, default: '' },
      },
    ],
    totalRefund: { type: Number, required: true },
    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseReturnSchema.index({ originalPurchaseRef: 1 });
purchaseReturnSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
