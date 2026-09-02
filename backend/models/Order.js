const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    barcode: { type: String },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    image: { type: String, default: '' },
    // Snapshotted from the Product at order time — GST-compliance field for
    // the bill's HSN-wise tax summary.
    hsnCode: { type: String, default: '' },
    // Per-item GST rate, snapshotted from Product at order time — see
    // SaleTransaction.saleItemSchema.gstPercent for the same rule.
    gstPercent: { type: Number, default: null },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: 'US' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    channel: { type: String, default: 'WEB' },
    items: [orderItemSchema],
    shippingAddress: shippingAddressSchema,
    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ['COD', 'BANK_TRANSFER', 'CARD', 'ONLINE'],
      default: 'COD',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    fulfillmentStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
      default: 'PENDING',
    },
    note: { type: String, default: '' },
    couponCode: { type: String, default: '' },
    discountAmount: { type: Number, default: 0 },
    creditPointsEarned: { type: Number, default: 0 },
    creditPointsRedeemed: { type: Number, default: 0 },
    // Stock reservation tracking
    stockReserved: { type: Boolean, default: false },
    stockDeducted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ fulfillmentStatus: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
