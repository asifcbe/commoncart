const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    // Null for a "custom" line item sold at POS without a catalogued product
    // (no barcode, no stock tracking) — see `custom` below. Otherwise the
    // Product this line was sold from.
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    // True when this line has no backing Product: entered by hand at POS
    // (name + price + optional HSN/GST), no stock movement, still taxed and
    // still earns loyalty points like any other line.
    custom: { type: Boolean, default: false },
    // Stable per-line identity. For scanned items this is just the productId
    // string; for custom items (productId: null) it's a generated id so the
    // Return/Exchange/Replace flow can tell two custom lines apart. Absent on
    // sales made before this field existed — those fall back to productId,
    // which is fine since they never carry custom items.
    lineId: { type: String, default: null },
    barcode: { type: String },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    // What the customer is actually charged per unit (the aged/discount price
    // when the product had one, else the list price). GST is computed from this.
    price: { type: Number, required: true, min: 0 },
    // The price this line was selling at BEFORE any aging discount — the
    // product's manual/shop discount price if it had one, otherwise the MRP.
    // Equal to `price` when the line wasn't aged; higher when it was. Shown on
    // the bill so the aged reduction is broken out as a "Clearance discount"
    // line. Absent on sales made before this field.
    mrp: { type: Number, default: null },
    // true when this line was sold at an AGING (clearance) discount — the
    // reduction is shown as "Clearance discount" on the bill, and the line
    // can't be returned/exchanged.
    isDiscounted: { type: Boolean, default: false },
    // Snapshotted from Product.exchangeable at sale time (false only when the
    // purchase-entry "Exchange/Replace Eligible" box was unchecked). Distinct
    // from isDiscounted/aged — a full-price item can still be marked no-
    // exchange. Blocks RETURN/EXCHANGE/REPLACE the same way isDiscounted does.
    noExchange: { type: Boolean, default: false },
    // Snapshotted from the Product at sale time — GST-compliance field for the
    // bill's HSN-wise tax summary. Absent (undefined) on sales made before
    // this field existed, or when the product had no HSN code set.
    hsnCode: { type: String, default: '' },
    // Per-item GST rate, snapshotted from Product/Purchase at sale time — a
    // sale's tax basis must never drift if a product's rate changes later,
    // same rule as hsnCode. null = this line used the shop's default GST %
    // (sale.gst.percent) at sale time. No min/max validators here — a
    // snapshot must always be able to save whatever was true at sale time.
    gstPercent: { type: Number, default: null },
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
      enum: ['COMPLETED', 'REFUNDED', 'PENDING', 'VOIDED'],
      default: 'COMPLETED',
    },
    // Set only when an admin voids this bill (see voidSale) — the document is
    // kept for GST/audit continuity (invoice numbers must never have gaps),
    // just marked cancelled. Stock, loyalty points, and coupon usage are
    // reversed at void time; see voidSale in salesController.js.
    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, default: '' },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerPhone: { type: String, default: '' },
    customerName: { type: String, default: '' },
    couponCode: { type: String, default: '' },
    discountAmount: { type: Number, default: 0 },
    // Signed rupee round-off adjustment folded into totalAmount at checkout
    // (positive = rounded up, negative = rounded down). Stored separately so
    // a later return/exchange session can back it out of the goods total
    // instead of re-deriving it. Absent (undefined) on sales made before this
    // field existed — treated as 0 by any reader.
    roundOffAmount: { type: Number, default: 0 },
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
      // Links back to the Settlement this amount was netted from, so reports
      // (Day Book) can tell this Settlement's cash movement was already
      // absorbed into this sale's own total instead of double-counting it —
      // or, when a Settlement has no sale pointing back at it, know that
      // refund was paid out on its own and must be booked independently.
      settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Settlement', default: null },
    },
  },
  { timestamps: true }
);

saleTransactionSchema.index({ channel: 1 });
saleTransactionSchema.index({ createdAt: -1 });
saleTransactionSchema.index({ soldBy: 1 });

module.exports = mongoose.model('SaleTransaction', saleTransactionSchema);
