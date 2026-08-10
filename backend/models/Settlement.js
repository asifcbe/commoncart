const mongoose = require('mongoose');

// Records the net cash/credit movement for one return/exchange session, per
// Customer Settlement = New Invoice Total − Credit Note Total. Created only
// when a session produced a Credit Note and/or a new Tax Invoice — pure
// Keep/Replace sessions never create a Settlement (nothing financial happened).
const settlementSchema = new mongoose.Schema(
  {
    originalSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', required: true, index: true },
    originalTransactionId: { type: String, required: true },
    creditNoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditNote', default: null },
    newSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleTransaction', default: null },
    replacementNoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReplacementNote', default: null },

    creditNoteTotal: { type: Number, default: 0 },
    newInvoiceTotal: { type: Number, default: 0 },
    netAmount: { type: Number, required: true }, // signed: newInvoiceTotal - creditNoteTotal
    direction: { type: String, enum: ['CUSTOMER_PAYS', 'REFUND_TO_CUSTOMER', 'NONE'], required: true },
    method: { type: String, enum: ['CASH', 'CARD', 'MOBILE', 'STORE_CREDIT', 'OTHER'], required: true },
    // Rupees credited to Customer.storeCredit, when method === STORE_CREDIT
    // and direction === REFUND_TO_CUSTOMER.
    storeCreditApplied: { type: Number, default: 0 },

    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

settlementSchema.index({ originalSaleId: 1 });
settlementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Settlement', settlementSchema);
