const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: {
      type: String,
      enum: [
        'SALE', 'RESTOCK', 'ADJUSTMENT', 'RETURN',
        'EXCHANGE_IN',      // old item from an exchange restored to sellable stock
        'EXCHANGE_OUT',     // new item taken in an exchange, deducted from sellable stock
        'DAMAGED_IN',       // replaced-away unit moved from sellable stock into damagedQty
        'REPLACEMENT_OUT',  // replacement unit deducted from sellable stock
      ],
      required: true,
    },
    channel: { type: String, enum: ['STORE', 'WEB', 'SYSTEM'], default: 'SYSTEM' },
    quantityChanged: { type: Number, required: true },
    previousQty: { type: Number, required: true },
    newQty: { type: Number, required: true },
    note: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transactionId: { type: String, default: null },
  },
  { timestamps: true }
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1 });
stockMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
