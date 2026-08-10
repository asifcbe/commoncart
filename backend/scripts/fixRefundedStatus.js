/**
 * One-time cleanup: the old return flow unconditionally flipped
 * SaleTransaction.status to 'REFUNDED' on ANY return, even a partial one
 * (a bug — the old code claimed a "full return" check that didn't exist).
 * This script recomputes true coverage from legacy SaleReturn records and
 * flips wrongly-REFUNDED sales back to COMPLETED.
 *
 * Safe to re-run (idempotent) — only touches sales that are still marked
 * REFUNDED but whose legacy returns don't actually cover every unit.
 *
 * Run: node scripts/fixRefundedStatus.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SaleTransaction = require('../models/SaleTransaction');
const SaleReturn = require('../models/SaleReturn');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const refundedSales = await SaleTransaction.find({ status: 'REFUNDED' });
  console.log(`Checking ${refundedSales.length} REFUNDED sale(s)...`);

  let fixed = 0;
  for (const sale of refundedSales) {
    const originalQtyByProduct = {};
    sale.items.forEach((it) => {
      const key = String(it.productId);
      originalQtyByProduct[key] = (originalQtyByProduct[key] || 0) + it.qty;
    });

    const legacyReturns = await SaleReturn.find({ originalSaleId: sale._id });
    const returnedQtyByProduct = {};
    legacyReturns.forEach((r) => {
      r.items.forEach((it) => {
        const key = String(it.productId);
        returnedQtyByProduct[key] = (returnedQtyByProduct[key] || 0) + it.qty;
      });
    });

    const fullyCovered = Object.entries(originalQtyByProduct)
      .every(([productId, qty]) => (returnedQtyByProduct[productId] || 0) >= qty);

    if (!fullyCovered) {
      sale.status = 'COMPLETED';
      await sale.save();
      fixed += 1;
      console.log(`  Fixed ${sale.transactionId}: was REFUNDED but only partially returned.`);
    }
  }

  console.log(`Done. Fixed ${fixed} of ${refundedSales.length} sale(s).`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
