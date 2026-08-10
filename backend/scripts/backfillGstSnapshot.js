/**
 * One-time backfill: stamps today's GST rate (from BUSINESS_CONFIG) onto every
 * SaleTransaction that predates GST snapshotting (no `gst` field yet). This
 * doesn't change any historical money already collected — it only removes
 * ambiguity for future Credit Notes issued against these old invoices, which
 * would otherwise need a live-config fallback (gstFallbackUsed: true).
 *
 * Safe to re-run (idempotent) — only touches sales with no `gst.enabled` set.
 *
 * Run: node scripts/backfillGstSnapshot.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SaleTransaction = require('../models/SaleTransaction');
const { getGstSnapshot } = require('../utils/gstSnapshot');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const gst = await getGstSnapshot();
  const result = await SaleTransaction.updateMany(
    { 'gst.enabled': { $exists: false } },
    { $set: { gst } }
  );

  console.log(`Backfilled GST snapshot onto ${result.modifiedCount} sale(s) using current rate: ${gst.percent}% (enabled: ${gst.enabled}).`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
