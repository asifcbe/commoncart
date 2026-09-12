const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, required: true, trim: true },
    subCategory: { type: String, default: '', trim: true },
    // HSN (Harmonized System of Nomenclature) code — GST-compliance field for
    // the tax invoice's HSN summary. Optional; shown on the bill only for
    // products that have one set.
    hsnCode: { type: String, default: '', trim: true },
    // Per-product GST rate override. null = "use the shop's default GST %
    // (BUSINESS_CONFIG.gstPercent)" — the vast majority of products. A number
    // (including 0) is an explicit override, e.g. for goods taxed at a
    // different rate than the shop's usual rate.
    gstPercent: { type: Number, default: null, min: 0, max: 100 },
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
    // Garment dimensions in inches, admin-entered. Optional — null means "not
    // measured". Used purely as display data: when both are set, the
    // frontend renders a second gallery entry that's the SAME first photo
    // (images[0]) with a ruler overlay drawn on top of it in HTML/SVG at
    // view time — no extra image file is ever generated or stored for this.
    widthInches: { type: Number, default: null, min: 0 },
    heightInches: { type: Number, default: null, min: 0 },
    supplier: { type: String, default: '' },
    location: { type: String, default: '' },
    lowStockThreshold: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    isWebVisible: { type: Boolean, default: false },
    color: { type: String, default: '' },
    size: { type: String, default: '' },
    // `discountPrice` is the EFFECTIVE selling price shown everywhere (POS,
    // storefront, bills) — null means "sell at `price`". It may be set by the
    // shop manually, or lowered further by the Price Aging system.
    discountPrice: { type: Number, default: null },
    // The shop-set discount, kept separate so Price Aging can compute from it
    // (aging discounts the manual price when one exists, else the MRP) and
    // restore it when an aging discount is later cleared. null = no manual
    // discount. Products created before this field existed have it backfilled
    // from `discountPrice` when they are not currently aged.
    manualDiscountPrice: { type: Number, default: null },
    // Opt-in to the Price Aging system (Settings → Price Aging). Only products
    // with this ON are ever auto-discounted by product age, listed on the
    // Aged Products screen, or shown on the storefront clearance page. Default
    // OFF — set per-product at purchase-entry time via the "Enable aging" box.
    agingEnabled: { type: Boolean, default: false },
    // The date product age is measured from for Price Aging — the PURCHASE
    // date, not when this record was inserted. Set from the purchase's
    // `purchaseDate` when the unit is created / on purchase edit. Falls back
    // to `createdAt` for products made before this field existed.
    agingBaseDate: { type: Date, default: null },
    // true only when the price-aging system has auto-discounted this product.
    // Aged items cannot be exchanged; manually-discounted items can.
    isAged: { type: Boolean, default: false },
    // Per-unit Exchange/Replace eligibility, set at purchase-entry time via
    // the "Exchange/Replace Eligible" checkbox (default ON). OFF behaves like
    // an aged/clearance item — returnSessionController blocks RETURN/EXCHANGE/
    // REPLACE against it.
    exchangeable: { type: Boolean, default: true },
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
