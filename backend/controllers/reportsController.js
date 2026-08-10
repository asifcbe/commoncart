const SaleTransaction = require('../models/SaleTransaction');

// Day Book — for a date range, breaks down completed in-store (POS) sales by
// payment mode (unpacking split payments into their own mode buckets) so the
// till can be reconciled against what's actually in the cash drawer/gateway.
// Web orders are excluded — this is a physical-till report, not an all-channel one.
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

    const sales = await SaleTransaction.find({
      channel: 'STORE',
      status: 'COMPLETED',
      ...dateFilter,
    })
      .select('transactionId totalAmount paymentMethod splitPayments discountAmount creditPointsEarned creditPointsRedeemed carriedSettlement customerName customerPhone createdAt')
      .sort('-createdAt')
      .lean();

    // Amount actually collected/settled per transaction = goods total + carried settlement.
    const modeMap = new Map(); // mode -> { mode, count, total }
    const bump = (mode, amount) => {
      const key = (mode || 'OTHER').toString();
      const entry = modeMap.get(key) || { mode: key, count: 0, total: 0 };
      entry.total += amount;
      modeMap.set(key, entry);
    };

    let grandTotal = 0;
    let discountTotal = 0;
    let pointsEarnedTotal = 0;
    let pointsRedeemedTotal = 0;

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
      new Set(modes).forEach((m) => {
        const entry = modeMap.get(m);
        if (entry) entry.count += 1;
      });
    }

    const modes = Array.from(modeMap.values()).sort((a, b) => b.total - a.total);

    res.json({
      startDate: startDate || null,
      endDate: endDate || null,
      transactionCount: sales.length,
      grandTotal,
      discountTotal,
      pointsEarnedTotal,
      pointsRedeemedTotal,
      modes,
      transactions: sales,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
