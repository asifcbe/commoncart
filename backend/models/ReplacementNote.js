const mongoose = require('mongoose');

const replacementItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true }, // reference only — no GST/money impact
    // The replacement is always the identical product (warranty/defective
    // swap) — kept explicit for clarity and to leave room for a future
    // "equivalent SKU" relaxation without a schema change.
    replacementProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  },
  { _id: false }
);

// Records a warranty/defective replacement of the identical product. No
// Credit Note, no new Tax Invoice, no refund, no GST impact — the old unit
// moves to Product.damagedQty and a replacement unit is deducted from
// sellable stock, but no money or tax changes hands.
const replacementNoteSchema = new mongoose.Schema(
  {
    replacementNumber: { type: String, unique: true, required: true },
    originalTransactionId: { type: String, required: true },
    originalSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    items: [replacementItemSchema],
    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

replacementNoteSchema.index({ originalSaleId: 1 });
replacementNoteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ReplacementNote', replacementNoteSchema);
