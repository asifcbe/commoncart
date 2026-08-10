const mongoose = require('mongoose');

const exchangeSchema = new mongoose.Schema(
  {
    exchangeId: { type: String, unique: true, required: true },
    originalTransactionId: { type: String, required: true },
    originalSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', required: true },

    // Item being returned
    returnedItem: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      barcode: { type: String },
      name: { type: String, required: true },
      qty: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true },
      isDiscounted: { type: Boolean, default: false },
    },

    // Item being taken (new sale)
    newItem: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      barcode: { type: String },
      name: { type: String, required: true },
      qty: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true },
    },

    returnedValue: { type: Number, required: true },  // value of item being returned
    newValue: { type: Number, required: true },        // value of new item
    // positive = customer pays extra, negative = shop refunds
    balanceDue: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['CASH', 'CARD', 'MOBILE', 'OTHER'], default: 'CASH' },
    note: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

exchangeSchema.index({ originalTransactionId: 1 });
exchangeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Exchange', exchangeSchema);
