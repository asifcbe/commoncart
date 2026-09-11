/**
 * backfillAgingBaseDate — one-time migration.
 *
 * Price Aging now measures product age from the PURCHASE date
 * (Product.agingBaseDate), not the row's createdAt. This backfills
 * agingBaseDate for every existing product that doesn't have one:
 *   - if the product appears on a Purchase → use that purchase's purchaseDate
 *   - otherwise → use the product's own createdAt
 *
 *   node scripts/backfillAgingBaseDate.js            # apply
 *   node scripts/backfillAgingBaseDate.js --dry-run  # report only
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');

async function run() {
  const dry = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (process.env.MONGODB_URIprod && uri === process.env.MONGODB_URIprod) {
    console.error('Refusing to run against the production URI.'); process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected (${uri.replace(/\/\/[^@]*@/, '//<credentials>@')})${dry ? ' — DRY RUN' : ''}`);

  const missing = await Product.countDocuments({
    $or: [{ agingBaseDate: null }, { agingBaseDate: { $exists: false } }],
  });
  console.log(`${missing} product(s) without agingBaseDate`);
  if (missing === 0) { await mongoose.disconnect(); return; }

  // Map productId -> earliest purchaseDate it was bought on.
  console.log('Indexing purchases…');
  const purchaseDateByProduct = new Map();
  const cursor = Purchase.find({}, 'purchaseDate items.productId').lean().cursor();
  for await (const pur of cursor) {
    const d = pur.purchaseDate ? new Date(pur.purchaseDate) : null;
    if (!d) continue;
    for (const it of pur.items || []) {
      const id = it.productId && String(it.productId);
      if (!id) continue;
      const cur = purchaseDateByProduct.get(id);
      if (!cur || d < cur) purchaseDateByProduct.set(id, d);
    }
  }
  console.log(`  ${purchaseDateByProduct.size} product(s) linked to a purchase`);

  let fromPurchase = 0;
  let fromCreatedAt = 0;
  const ops = [];
  const prodCursor = Product.find(
    { $or: [{ agingBaseDate: null }, { agingBaseDate: { $exists: false } }] },
    '_id createdAt'
  ).lean().cursor();

  for await (const p of prodCursor) {
    const purDate = purchaseDateByProduct.get(String(p._id));
    const base = purDate || p.createdAt;
    if (purDate) fromPurchase++; else fromCreatedAt++;
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { agingBaseDate: base } } } });
    if (ops.length === 1000 && !dry) { await Product.bulkWrite(ops, { ordered: false }); ops.length = 0; }
  }
  if (ops.length && !dry) await Product.bulkWrite(ops, { ordered: false });

  console.log(`\n${dry ? 'Would set' : 'Set'} agingBaseDate on ${fromPurchase + fromCreatedAt} product(s):`);
  console.log(`  ${fromPurchase} from their purchase date`);
  console.log(`  ${fromCreatedAt} fell back to createdAt (no linked purchase)`);

  await mongoose.disconnect();
  console.log(dry ? '\nDry run — nothing written.' : '\nDone.');
}

run().catch((err) => { console.error(err); process.exit(1); });
