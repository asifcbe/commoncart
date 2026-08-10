const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, required: true, trim: true },
    subCategory: { type: String, default: '', trim: true },
    SKU: { type: String, unique: true },
    barcode: { type: String, unique: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },
    // Units moved out of sellable stock via a warranty/defective Replacement
    // (see ReplacementNote). Separate bucket — not part of quantity/reservedQty/
    // availableQty. No write-off/restock UI yet; the counter just accumulates.
    damagedQty: { type: Number, default: 0, min: 0 },
    images: [{ type: String }],
    supplier: { type: String, default: '' },
    location: { type: String, default: '' },
    lowStockThreshold: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    isWebVisible: { type: Boolean, default: false },
    color: { type: String, default: '' },
    size: { type: String, default: '' },
    discountPrice: { type: Number, default: null },
    // true only when the price-aging system has auto-discounted this product.
    // Aged items cannot be exchanged; manually-discounted items can.
    isAged: { type: Boolean, default: false },
    // Timestamp of when available stock first hit zero. Set when availableQty
    // drops to 0, cleared on restock. Used by the auto-delete sweep to measure
    // how long a product has been continuously out of stock.
    outOfStockSince: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.virtual('availableQty').get(function () {
  return Math.max(0, this.quantity - this.reservedQty);
});

// Keep `outOfStockSince` in sync whenever stock changes through a .save() path.
// (The auto-delete sweep also reconciles this for updates that bypass save hooks.)
productSchema.pre('save', function (next) {
  if (this.isModified('quantity') || this.isModified('reservedQty')) {
    const available = this.quantity - this.reservedQty;
    if (available <= 0 && !this.outOfStockSince) {
      this.outOfStockSince = new Date();
    } else if (available > 0 && this.outOfStockSince) {
      this.outOfStockSince = null;
    }
  }
  next();
});

productSchema.index({ name: 'text', SKU: 'text', barcode: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
