const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    isDiscounted: { type: Boolean, default: false },
  },
  { _id: false }
);

const saleTransactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, unique: true, required: true },
    channel: { type: String, enum: ['STORE', 'WEB'], required: true },
    items: [saleItemSchema],
    totalAmount: { type: Number, required: true },
    // Not a fixed enum — payment modes are admin-configurable (see
    // PAYMENT_MODES_CONFIG in AppSettings). Holds the primary/first mode when
    // splitPayments is used, so every existing single-method read path
    // (dashboard, exports, receipts) keeps working unchanged.
    paymentMethod: { type: String, default: 'CASH' },
    // Present only when the sale was paid across more than one mode (e.g. half
    // cash, half card). Amounts must sum to totalAmount + carriedSettlement.amount.
    splitPayments: [
      {
        method: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        _id: false,
      },
    ],
    status: {
      type: String,
      enum: ['COMPLETED', 'REFUNDED', 'PENDING'],
      default: 'COMPLETED',
    },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerPhone: { type: String, default: '' },
    customerName: { type: String, default: '' },
    couponCode: { type: String, default: '' },
    discountAmount: { type: Number, default: 0 },
    creditPointsEarned: { type: Number, default: 0 },
    creditPointsRedeemed: { type: Number, default: 0 },
    note: { type: String, default: '' },
    // GST rate/breakup snapshotted at creation time so this invoice's tax basis
    // never drifts if the shop's BUSINESS_CONFIG rate changes later. Absent
    // (undefined) on invoices created before GST snapshotting existed.
    gst: {
      enabled: { type: Boolean, default: false },
      percent: { type: Number, default: 0 },
      inclusive: { type: Boolean, default: true },
      cgstPercent: { type: Number, default: 0 },
      sgstPercent: { type: Number, default: 0 },
      igstPercent: { type: Number, default: 0 },
      gstin: { type: String, default: '' },
      stateName: { type: String, default: '' },
    },
    // Set when this invoice IS the "new item" side of an Exchange — links back
    // to the Credit Note that funded it. Null for ordinary sales.
    settledAgainstCreditNoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditNote', default: null },
    isExchangeInvoice: { type: Boolean, default: false },
    // Snapshot of a prior return/exchange session's settlement carried into
    // this sale (via "Continue to New Sale"). Purely a bill adjustment line —
    // does not touch Settlement/CreditNote records, which stay closed.
    carriedSettlement: {
      amount: { type: Number, default: 0 }, // positive = customer owed money in, negative = shop owes customer
      sourceLabel: { type: String, default: '' }, // e.g. "Credit Note CN-000004"
    },
  },
  { timestamps: true }
);

saleTransactionSchema.index({ channel: 1 });
saleTransactionSchema.index({ createdAt: -1 });
saleTransactionSchema.index({ soldBy: 1 });

module.exports = mongoose.model('SaleTransaction', saleTransactionSchema);
