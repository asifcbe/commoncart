const mongoose = require('mongoose');
const SaleTransaction = require('../models/SaleTransaction');
const CreditNote = require('../models/CreditNote');
const ReplacementNote = require('../models/ReplacementNote');
const Settlement = require('../models/Settlement');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');
const { getGstSnapshot, computeGstFromSnapshot } = require('../utils/gstSnapshot');

// Sum of returned/replaced qty so far per productId, across ALL CreditNotes /
// ReplacementNotes referencing this original sale — the sole source of truth
// for "how much of this line is still available to act on." Both source
// collections are insert-only, so this is always consistent (no cache to
// invalidate).
async function getConsumedQtyByProduct(originalSaleId) {
  const [returned, replaced] = await Promise.all([
    CreditNote.aggregate([
      { $match: { originalSaleId } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', qty: { $sum: '$items.qty' } } },
    ]),
    ReplacementNote.aggregate([
      { $match: { originalSaleId } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', qty: { $sum: '$items.qty' } } },
    ]),
  ]);
  const map = {};
  returned.forEach((r) => { map[String(r._id)] = (map[String(r._id)] || 0) + r.qty; });
  replaced.forEach((r) => { map[String(r._id)] = (map[String(r._id)] || 0) + r.qty; });
  return map;
}

exports.getConsumedQtyByProduct = getConsumedQtyByProduct;

// ─── Process a full return/exchange/replace session for one invoice ──────
exports.processReturnSession = async (req, res) => {
  const { saleId, actions, settlement: settlementInput, note } = req.body;

  if (!actions || !actions.length)
    return res.status(400).json({ message: 'At least one action is required' });

  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const sale = await SaleTransaction.findById(saleId).session(mongoSession);
      if (!sale) throw Object.assign(new Error('Sale not found'), { status: 404 });

      // Build original per-product line quantities (defensive sum — a sale
      // could in theory carry the same product on two lines).
      const originalLineQtyByProduct = {};
      sale.items.forEach((it) => {
        const key = String(it.productId);
        originalLineQtyByProduct[key] = (originalLineQtyByProduct[key] || 0) + it.qty;
      });

      const consumed = await getConsumedQtyByProduct(sale._id);

      // ── Validate every action ──
      const returnLines = [];    // RETURN + EXCHANGE's returned-away side → one CreditNote
      const replaceLines = [];   // REPLACE → one ReplacementNote

      for (const act of actions) {
        const key = String(act.productId);
        const originalItem = sale.items.find((it) => String(it.productId) === key);
        if (!originalItem)
          throw Object.assign(new Error(`Product ${act.productId} was not on this invoice`), { status: 400 });

        const qty = Number(act.qty) || 0;
        if (qty < 1)
          throw Object.assign(new Error('Quantity must be at least 1'), { status: 400 });

        const already = consumed[key] || 0;
        const available = (originalLineQtyByProduct[key] || 0) - already;
        if (qty > available)
          throw Object.assign(new Error(`Only ${available} unit(s) of "${originalItem.name}" remain available to act on`), {
            status: 409, productId: act.productId, available,
          });
        // Reserve this qty against further actions in the same request
        // (e.g. two lines can't both consume the same remaining units).
        consumed[key] = already + qty;

        if (act.action === 'RETURN' || act.action === 'EXCHANGE') {
          const product = await Product.findById(act.productId).session(mongoSession);
          if (product?.isAged)
            throw Object.assign(new Error(`"${originalItem.name}" is an aged/clearance item and cannot be returned or exchanged.`), { status: 400 });

          returnLines.push({
            productId: originalItem.productId, barcode: originalItem.barcode, name: originalItem.name,
            qty, price: originalItem.price, isDiscounted: originalItem.isDiscounted,
            // EXCHANGE_OUT is otherwise identical to RETURN — the customer picks their
            // new item(s) as a normal POS purchase afterwards, carrying this Credit
            // Note's balance forward, rather than a new invoice being built here.
            lineType: act.action === 'EXCHANGE' ? 'EXCHANGE_OUT' : 'RETURN',
            reason: act.reason || '',
          });
        } else if (act.action === 'REPLACE') {
          const product = await Product.findById(act.productId).session(mongoSession);
          if (product?.isAged)
            throw Object.assign(new Error(`"${originalItem.name}" is an aged/clearance item and cannot be replaced.`), { status: 400 });
          replaceLines.push({
            productId: originalItem.productId, barcode: originalItem.barcode, name: originalItem.name,
            qty, price: originalItem.price, reason: act.reason || '',
          });
        } else {
          throw Object.assign(new Error(`Unknown action "${act.action}"`), { status: 400 });
        }
      }

      let creditNote = null;
      let newSale = null;
      let replacementNote = null;

      // ── Credit Note (RETURN + EXCHANGE_OUT lines) ──
      if (returnLines.length) {
        const gstBasis = sale.gst?.enabled != null ? sale.gst : null;
        const gstFallbackUsed = !gstBasis;
        const effectiveGst = gstBasis || await getGstSnapshot();

        const returnTotal = returnLines.reduce((s, l) => s + l.price * l.qty, 0);
        const gstCalc = computeGstFromSnapshot(returnTotal, effectiveGst);

        const creditNoteNumber = await generateInvoiceNumber('CN');
        creditNote = new CreditNote({
          creditNoteNumber,
          originalTransactionId: sale.transactionId,
          originalSaleId: sale._id,
          items: returnLines.map(({ reason, ...rest }) => rest),
          gst: {
            enabled: effectiveGst.enabled, percent: effectiveGst.percent, inclusive: effectiveGst.inclusive,
            cgstPercent: effectiveGst.cgstPercent, sgstPercent: effectiveGst.sgstPercent, igstPercent: effectiveGst.igstPercent,
          },
          gstFallbackUsed,
          taxableValue: gstCalc ? gstCalc.net : returnTotal,
          cgstAmount: gstCalc ? gstCalc.cgst : 0,
          sgstAmount: gstCalc ? gstCalc.sgst : 0,
          igstAmount: 0,
          creditNoteTotal: returnTotal,
          reason: returnLines.map((l) => l.reason).filter(Boolean).join('; '),
          note: note || '',
          processedBy: req.user._id,
        });

        for (const line of returnLines) {
          const product = await Product.findById(line.productId).session(mongoSession);
          const prev = product.quantity;
          product.quantity += line.qty;
          await product.save({ session: mongoSession });
          await StockMovement.create([{
            productId: product._id,
            type: line.lineType === 'EXCHANGE_OUT' ? 'EXCHANGE_IN' : 'RETURN',
            channel: 'STORE',
            quantityChanged: line.qty, previousQty: prev, newQty: product.quantity,
            note: `${line.lineType === 'EXCHANGE_OUT' ? 'Exchange return' : 'Return'} — original: ${sale.transactionId}, credit note: ${creditNoteNumber}`,
            performedBy: req.user._id, transactionId: sale.transactionId,
          }], { session: mongoSession });
          req.io?.emit('stock:updated', { productId: product._id.toString(), quantity: product.quantity, reservedQty: product.reservedQty });
        }
      }

      if (creditNote) await creditNote.save({ session: mongoSession });

      // ── Replacement Note (REPLACE lines) ──
      if (replaceLines.length) {
        const replacementNumber = await generateInvoiceNumber('RN');
        for (const line of replaceLines) {
          const product = await Product.findById(line.productId).session(mongoSession);
          const prevQty = product.quantity;
          product.quantity = Math.max(0, product.quantity - line.qty);
          product.damagedQty += line.qty;
          await product.save({ session: mongoSession });
          await StockMovement.create([
            {
              productId: product._id, type: 'DAMAGED_IN', channel: 'STORE',
              quantityChanged: -line.qty, previousQty: prevQty, newQty: product.quantity,
              note: `Replacement — defective unit moved to damaged stock — original: ${sale.transactionId}, replacement: ${replacementNumber}`,
              performedBy: req.user._id, transactionId: sale.transactionId,
            },
            {
              productId: product._id, type: 'REPLACEMENT_OUT', channel: 'STORE',
              quantityChanged: -line.qty, previousQty: product.quantity + line.qty, newQty: product.quantity,
              note: `Replacement unit issued — original: ${sale.transactionId}, replacement: ${replacementNumber}`,
              performedBy: req.user._id, transactionId: sale.transactionId,
            },
          ], { session: mongoSession });
          req.io?.emit('stock:updated', { productId: product._id.toString(), quantity: product.quantity, reservedQty: product.reservedQty });
        }

        const replacementDocs = await ReplacementNote.create([{
          replacementNumber,
          originalTransactionId: sale.transactionId,
          originalSaleId: sale._id,
          items: replaceLines.map((l) => ({
            productId: l.productId, barcode: l.barcode, name: l.name, qty: l.qty,
            price: l.price, replacementProductId: l.productId,
          })),
          reason: replaceLines.map((l) => l.reason).filter(Boolean).join('; '),
          note: note || '',
          processedBy: req.user._id,
        }], { session: mongoSession });
        replacementNote = replacementDocs[0];
      }

      // ── Settlement (Core Rule #8) ──
      let settlementDoc = null;
      if (creditNote || newSale) {
        const creditNoteTotal = creditNote ? creditNote.creditNoteTotal : 0;
        const newInvoiceTotal = newSale ? newSale.totalAmount : 0;
        const netAmount = newInvoiceTotal - creditNoteTotal;
        const direction = netAmount > 0 ? 'CUSTOMER_PAYS' : netAmount < 0 ? 'REFUND_TO_CUSTOMER' : 'NONE';
        const method = settlementInput?.method || 'CASH';

        let storeCreditApplied = 0;
        if (direction === 'REFUND_TO_CUSTOMER' && method === 'STORE_CREDIT' && sale.customerId) {
          storeCreditApplied = Math.abs(netAmount);
          await Customer.findByIdAndUpdate(sale.customerId, { $inc: { storeCredit: storeCreditApplied } }, { session: mongoSession });
        }

        const settlementDocs = await Settlement.create([{
          originalSaleId: sale._id, originalTransactionId: sale.transactionId,
          creditNoteId: creditNote?._id || null, newSaleId: newSale?._id || null, replacementNoteId: replacementNote?._id || null,
          creditNoteTotal, newInvoiceTotal, netAmount, direction, method, storeCreditApplied,
          processedBy: req.user._id,
        }], { session: mongoSession });
        settlementDoc = settlementDocs[0];
      }

      // ── Derive full-coverage and flip status (the one permitted write) ──
      const finalConsumed = await getConsumedQtyByProduct(sale._id);
      const fullyCovered = Object.entries(originalLineQtyByProduct)
        .every(([productId, qty]) => (finalConsumed[productId] || 0) >= qty);
      if (fullyCovered && sale.status !== 'REFUNDED') {
        sale.status = 'REFUNDED';
        await sale.save({ session: mongoSession });
      }

      result = {
        creditNote: creditNote ? creditNote.toObject() : null,
        newSale: newSale ? newSale.toObject() : null,
        replacementNote: replacementNote ? replacementNote.toObject() : null,
        settlement: settlementDoc ? settlementDoc.toObject() : null,
        originalSale: sale.toObject(),
      };
    });

    req.io?.emit('return-session:created', {
      originalTransactionId: result.originalSale.transactionId,
      creditNoteNumber: result.creditNote?.creditNoteNumber || null,
      newTransactionId: result.newSale?.transactionId || null,
      replacementNumber: result.replacementNote?.replacementNumber || null,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, productId: err.productId, available: err.available });
  } finally {
    mongoSession.endSession();
  }
};

// ─── Credit Notes ──────────────────────────────────────────────
exports.listCreditNotes = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.createdAt.$lte = end; }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [creditNotes, total] = await Promise.all([
      CreditNote.find(query).sort('-createdAt').skip(skip).limit(Number(limit)).populate('processedBy', 'name'),
      CreditNote.countDocuments(query),
    ]);
    res.json({ creditNotes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCreditNote = async (req, res) => {
  try {
    const creditNote = await CreditNote.findById(req.params.id).populate('processedBy', 'name');
    if (!creditNote) return res.status(404).json({ message: 'Credit note not found' });
    res.json({ creditNote });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Replacement Notes ─────────────────────────────────────────
exports.listReplacementNotes = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.createdAt.$lte = end; }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [replacementNotes, total] = await Promise.all([
      ReplacementNote.find(query).sort('-createdAt').skip(skip).limit(Number(limit)).populate('processedBy', 'name'),
      ReplacementNote.countDocuments(query),
    ]);
    res.json({ replacementNotes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getReplacementNote = async (req, res) => {
  try {
    const replacementNote = await ReplacementNote.findById(req.params.id).populate('processedBy', 'name');
    if (!replacementNote) return res.status(404).json({ message: 'Replacement note not found' });
    res.json({ replacementNote });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
