/**
 * backfillManualDiscount — one-time migration.
 *
 * Price Aging now ages a product down from its MANUAL (shop-set) discount
 * price when it has one, else from MRP, and stores that manual price in
 * Product.manualDiscountPrice so it can be restored when an aging discount
 * is later cleared.
 *
 * This backfills manualDiscountPrice for existing products:
 *   - NOT currently aged (isAged !== true) and has a discountPrice
 *       → that discountPrice IS the manual discount. Copy it across.
 *   - currently aged (isAged === true)
 *       → the discountPrice is an aging price, not a manual one. We can't
 *         recover a manual discount that was overwritten, so leave
 *         manualDiscountPrice = null (ages from MRP, same as before).
 *   - no discountPrice → nothing to do.
 *
 *   node scripts/backfillManualDiscount.js            # apply
 *   node scripts/backfillManualDiscount.js --dry-run  # report only
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function run() {
  const dry = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (process.env.MONGODB_URIprod && uri === process.env.MONGODB_URIprod) {
    console.error('Refusing to run against the production URI.'); process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected (${uri.replace(/\/\/[^@]*@/, '//<credentials>@')})${dry ? ' — DRY RUN' : ''}`);

  const candidates = await Product.find({
    manualDiscountPrice: { $in: [null, undefined] },
    discountPrice: { $ne: null },
    $or: [{ isAged: { $ne: true } }, { isAged: { $exists: false } }],
  }).select('_id discountPrice').lean();

  console.log(`${candidates.length} product(s) will get manualDiscountPrice = their current discountPrice`);

  if (!dry && candidates.length) {
    const ops = candidates.map((p) => ({
      updateOne: { filter: { _id: p._id }, update: { $set: { manualDiscountPrice: p.discountPrice } } },
    }));
    for (let i = 0; i < ops.length; i += 1000) {
      await Product.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    }
  }

  const agedNoManual = await Product.countDocuments({ isAged: true, manualDiscountPrice: { $in: [null, undefined] } });
  console.log(`${agedNoManual} currently-aged product(s) left with manualDiscountPrice = null (age from MRP — unchanged behaviour)`);

  await mongoose.disconnect();
  console.log(dry ? '\nDry run — nothing written.' : '\nDone. Run "Apply Now" (or seedCategoryImages is unrelated) to re-price aged items from the manual base.');
}

run().catch((err) => { console.error(err); process.exit(1); });
