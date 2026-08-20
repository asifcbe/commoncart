const mongoose = require('mongoose');

const creditNoteItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    isDiscounted: { type: Boolean, default: false },
    // RETURN = plain return; EXCHANGE_OUT = returned-away side of an exchange.
    lineType: { type: String, enum: ['RETURN', 'EXCHANGE_OUT'], required: true },
    // Informational link to the new item this line was exchanged for, if any.
    exchangeNewProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  },
  { _id: false }
);

// A Credit Note reverses value + GST for returned/exchanged-away items against
// an original Tax Invoice, without ever modifying that invoice. One Credit
// Note per return session — covers both pure returns and the returned-away
// side of exchanges in the same session.
const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteNumber: { type: String, unique: true, required: true },
    originalTransactionId: { type: String, required: true },
    originalSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    items: [creditNoteItemSchema],

    // GST reversal basis — snapshotted from the original invoice's own `gst`
    // field when present; else best-effort from current shop config.
    gst: {
      enabled: { type: Boolean, default: false },
      percent: { type: Number, default: 0 },
      inclusive: { type: Boolean, default: true },
      cgstPercent: { type: Number, default: 0 },
      sgstPercent: { type: Number, default: 0 },
      igstPercent: { type: Number, default: 0 },
    },
    // True when the original invoice predates GST snapshotting and this
    // Credit Note's tax basis was inferred from current settings instead.
    gstFallbackUsed: { type: Boolean, default: false },

    taxableValue: { type: Number, required: true },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    // creditNoteTotal is the actual refund owed — the returned lines' gross
    // value scaled by the original bill's net-payable ratio (so the
    // customer's own discount/round-off share on those lines is honoured,
    // not their full list price). See `netPayableRatio` below.
    creditNoteTotal: { type: Number, required: true },
    // The original sale's (totalAmount + roundOffAmount already included in
    // totalAmount... see controller) net-payable ÷ gross-goods ratio used to
    // compute creditNoteTotal from the returned lines' gross value. Purely
    // informational/audit — recomputing it later would need the original
    // sale's numbers anyway.
    netPayableRatio: { type: Number, default: 1 },

    // Loyalty points reversal for this session's returned lines, proportional
    // to the value returned. pointsClawedBack = earned points removed from
    // the customer's balance; pointsRestored = previously-redeemed points
    // credited back (the discount they funded no longer applies to a kept item).
    pointsClawedBack: { type: Number, default: 0 },
    pointsRestored: { type: Number, default: 0 },

    // Set when this Credit Note funded (wholly or partly) a new Tax Invoice
    // created during an exchange in the same session.
    linkedNewSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', default: null },
    linkedNewTransactionId: { type: String, default: '' },

    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

creditNoteSchema.index({ originalSaleId: 1 });
creditNoteSchema.index({ originalTransactionId: 1 });
creditNoteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CreditNote', creditNoteSchema);
