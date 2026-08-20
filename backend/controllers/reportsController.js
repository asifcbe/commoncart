const SaleTransaction = require('../models/SaleTransaction');
const Settlement = require('../models/Settlement');

// Day Book — for a date range, breaks down completed in-store (POS) sales by
// payment mode (unpacking split payments into their own mode buckets) so the
// till can be reconciled against what's actually in the cash drawer/gateway.
// Web orders are excluded — this is a physical-till report, not an all-channel one.
//
// Also includes cash/card/mobile/other refunds paid out for returns/exchanges
// (Settlement records) as their own negative line, dated to when the refund
// was actually paid — NOT backdated to the original sale. A refund that was
// instead netted into a later "carry forward" sale (see SaleTransaction.
// carriedSettlement.settlementId) is already reflected in that sale's own
// total, so it's excluded here to avoid counting the same cash movement twice.
// STORE_CREDIT settlements never move cash/card money at all — they create a
// liability on the customer's account instead — so they're excluded outright.
exports.getDayBook = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    const [sales, settlements] = await Promise.all([
      SaleTransaction.find({
        channel: 'STORE',
        status: 'COMPLETED',
        ...dateFilter,
      })
        .select('transactionId totalAmount paymentMethod splitPayments discountAmount creditPointsEarned creditPointsRedeemed carriedSettlement customerName customerPhone createdAt')
        .sort('-createdAt')
        .lean(),

      // Only refunds actually paid via a real payment mode — STORE_CREDIT
      // never touches cash/card, so it's excluded at the query level.
      Settlement.find({
        direction: 'REFUND_TO_CUSTOMER',
        method: { $ne: 'STORE_CREDIT' },
        ...dateFilter,
      })
        .select('originalTransactionId netAmount method createdAt')
        .sort('-createdAt')
        .lean(),
    ]);

    // A settlement already folded into a later sale's carriedSettlement is
    // already counted via that sale's own total below — exclude it here.
    const consumedSettlementIds = new Set(
      sales
        .filter((s) => s.carriedSettlement?.settlementId)
        .map((s) => String(s.carriedSettlement.settlementId))
    );
    const standaloneRefunds = settlements.filter((s) => !consumedSettlementIds.has(String(s._id)));

    // mode -> { mode, count, salesTotal, refundCount, refundTotal, netTotal }
    const modeMap = new Map();
    const modeEntry = (mode) => {
      const key = (mode || 'OTHER').toString();
      let entry = modeMap.get(key);
      if (!entry) {
        entry = { mode: key, count: 0, salesTotal: 0, refundCount: 0, refundTotal: 0, netTotal: 0 };
        modeMap.set(key, entry);
      }
      return entry;
    };
    const bump = (mode, amount) => {
      const entry = modeEntry(mode);
      entry.salesTotal += amount;
      entry.netTotal += amount;
    };

    let grandTotal = 0;
    let discountTotal = 0;
    let pointsEarnedTotal = 0;
    let pointsRedeemedTotal = 0;
    let refundTotal = 0;

    for (const sale of sales) {
      const amountDue = sale.totalAmount + (sale.carriedSettlement?.amount || 0);
      grandTotal += amountDue;
      discountTotal += sale.discountAmount || 0;
      pointsEarnedTotal += sale.creditPointsEarned || 0;
      pointsRedeemedTotal += sale.creditPointsRedeemed || 0;

      if (sale.splitPayments?.length) {
        sale.splitPayments.forEach((p) => bump(p.method, p.amount));
      } else {
        bump(sale.paymentMethod, amountDue);
      }
    }

    // Count transactions once per mode used (a split sale counts toward each mode it touched).
    for (const sale of sales) {
      const modes = sale.splitPayments?.length ? sale.splitPayments.map((p) => p.method) : [sale.paymentMethod || 'OTHER'];
      new Set(modes).forEach((m) => { modeEntry(m).count += 1; });
    }

    // Standalone refunds reduce their payment mode's net till total and the
    // overall grand total — this is the actual cash that left the drawer.
    // Tracked separately from salesTotal so the report shows "sold ₹X,
    // refunded ₹Y, net ₹(X-Y)" rather than a single opaque figure.
    for (const refund of standaloneRefunds) {
      const amount = Math.abs(refund.netAmount);
      refundTotal += amount;
      grandTotal -= amount;
      const entry = modeEntry(refund.method);
      entry.refundCount += 1;
      entry.refundTotal += amount;
      entry.netTotal -= amount;
    }

    const modes = Array.from(modeMap.values()).sort((a, b) => b.netTotal - a.netTotal);

    // Merge sales + standalone refunds into one chronological feed for the
    // transaction list, so a refund shows up on the day it actually happened.
    const transactions = [
      ...sales.map((s) => ({
        _id: s._id,
        kind: 'SALE',
        transactionId: s.transactionId,
        customerName: s.customerName,
        paymentMethod: s.splitPayments?.length ? s.splitPayments.map((p) => p.method).join(' + ') : s.paymentMethod,
        amount: s.totalAmount + (s.carriedSettlement?.amount || 0),
        createdAt: s.createdAt,
      })),
      ...standaloneRefunds.map((r) => ({
        _id: r._id,
        kind: 'REFUND',
        transactionId: r.originalTransactionId,
        customerName: '',
        paymentMethod: r.method,
        amount: -Math.abs(r.netAmount),
        createdAt: r.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      startDate: startDate || null,
      endDate: endDate || null,
      transactionCount: sales.length,
      refundCount: standaloneRefunds.length,
      grandTotal,
      discountTotal,
      refundTotal,
      pointsEarnedTotal,
      pointsRedeemedTotal,
      modes,
      transactions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
