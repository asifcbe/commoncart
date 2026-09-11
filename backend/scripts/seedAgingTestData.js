/**
 * seedAgingTestData — inserts a small, clearly-labelled set of products for
 * testing the Price Aging feature. Connects to process.env.MONGODB_URI (dev).
 *
 *   node scripts/seedAgingTestData.js          # add / refresh the test set
 *   node scripts/seedAgingTestData.js --clean  # remove the test set and exit
 *
 * What it creates (all names prefixed "TEST-AGING-", so they're easy to find
 * and safe to delete):
 *   - One product per aging bucket (Fresh 0d, 45d, 75d, 100d, 180d≈6mo, 400d,
 *     800d) with `agingEnabled: TRUE`  → should appear on Aged Products / Clearance
 *   - The same set again with `agingEnabled: FALSE` → must NOT appear anywhere aging-related
 *   - A few extra ~180-day (6-month) products, enabled, in a couple of categories
 * Also makes sure PRICE_AGING_CONFIG exists and is enabled so "Apply Now" works.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const AppSettings = require('../models/AppSettings');

const PREFIX = 'TEST-AGING-';
const DAY = 86400000;

// Mirrors DEFAULT_AGING in settingsController.js
const AGING_STEPS = [
  { days: 30, label: 'Fresh (30 days)', percent: 0 },
  { days: 60, label: 'Slow-moving (60 days)', percent: 5 },
  { days: 90, label: 'Clearance (90 days)', percent: 10 },
  { days: 120, label: 'Heavy Discount (120 days)', percent: 15 },
  { days: 180, label: 'Half-Year Sale (180 days)', percent: 20 },
  { days: 365, label: 'Annual Clearance (1 Year)', percent: 30 },
  { days: 730, label: 'Deep Clearance (2+ Years)', percent: 50 },
];

// One representative age per bucket (comfortably inside each band).
const BUCKETS = [
  { key: 'fresh',  ageDays: 10,  note: 'below first threshold (no discount)' },
  { key: '45d',    ageDays: 45,  note: '≥30d → 0% step' },
  { key: '75d',    ageDays: 75,  note: '≥60d → 5%' },
  { key: '100d',   ageDays: 100, note: '≥90d → 10%' },
  { key: '6month', ageDays: 183, note: '≈6 months, ≥180d → 20%' },
  { key: '400d',   ageDays: 400, note: '≥365d → 30%' },
  { key: '800d',   ageDays: 800, note: '≥730d → 50%' },
];

function stepFor(ageDays) {
  return [...AGING_STEPS].reverse().find((s) => ageDays >= s.days) || null;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (process.env.MONGODB_URIprod && uri === process.env.MONGODB_URIprod) {
    console.error('Refusing to run against the production URI.'); process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected (${uri.replace(/\/\/[^@]*@/, '//<credentials>@')})`);

  // Always start clean so re-runs don't pile up duplicates.
  const del = await Product.deleteMany({ name: { $regex: `^${PREFIX}` } });
  console.log(`Removed ${del.deletedCount} existing ${PREFIX}* product(s)`);
  if (process.argv.includes('--clean')) {
    await mongoose.disconnect();
    console.log('Clean-only run — done.');
    return;
  }

  // Ensure aging rules exist and are ON so the feature is testable end-to-end.
  await AppSettings.set('PRICE_AGING_CONFIG', { enabled: true, steps: AGING_STEPS });
  console.log('PRICE_AGING_CONFIG set (enabled: true, 7 steps)');

  const now = Date.now();
  let seq = 0;
  const rows = [];

  const make = ({ bucket, agingEnabled, category, applyDiscount }) => {
    seq += 1;
    // Backdate both createdAt and agingBaseDate — aging is now measured from
    // agingBaseDate (the purchase date).
    const createdAt = new Date(now - bucket.ageDays * DAY);
    const agingBaseDate = createdAt;
    const price = 1000;
    const costPrice = 400;
    const step = stepFor(bucket.ageDays);
    // Pre-apply the aging discount for the ENABLED ones so Aged Products /
    // Clearance show a discount immediately without hitting "Apply Now".
    let discountPrice = null;
    let isAged = false;
    if (applyDiscount && agingEnabled && step && step.percent > 0) {
      discountPrice = Math.max(costPrice, Math.round(price * (1 - step.percent / 100)));
      isAged = true;
    }
    const tag = agingEnabled ? 'ON' : 'OFF';
    const n = String(seq).padStart(3, '0');
    return {
      name: `${PREFIX}${bucket.key}-${tag}`,
      description: `Test product · aging ${tag} · age ${bucket.ageDays}d · ${bucket.note}`,
      category,
      subCategory: 'Aging Test',
      SKU: `${PREFIX}SKU-${n}`,
      barcode: `9990000${n}`,
      price,
      costPrice,
      quantity: 8,
      reservedQty: 0,
      images: [],
      supplier: 'Aging Test Supplier',
      isActive: true,
      isWebVisible: true,
      color: agingEnabled ? 'Blue' : 'Grey',
      size: 'M',
      discountPrice,
      agingEnabled,
      isAged,
      agingBaseDate, // aging measured from here (stands in for the purchase date)
      createdAt,     // set explicitly; overridden below because timestamps:true
      updatedAt: createdAt,
    };
  };

  // Enabled + disabled, one per bucket.
  for (const bucket of BUCKETS) {
    rows.push(make({ bucket, agingEnabled: true,  category: 'Clothing', applyDiscount: true }));
    rows.push(make({ bucket, agingEnabled: false, category: 'Clothing', applyDiscount: false }));
  }
  // Extra 6-month (≈180d) products, enabled, across a couple of categories.
  for (const category of ['Footwear', 'Accessories', 'Toys']) {
    rows.push(make({ bucket: { key: `6month-${category.toLowerCase()}`, ageDays: 180, note: '6-month test' }, agingEnabled: true, category, applyDiscount: true }));
  }

  // insertMany respects our explicit createdAt only if we disable the
  // timestamps plugin's setter for this write — Mongoose honours a provided
  // `createdAt` on insertMany when `timestamps: false` is passed.
  const docs = await Product.insertMany(rows, { timestamps: false });
  console.log(`\nInserted ${docs.length} test products:`);
  for (const d of docs) {
    const ageDays = Math.round((now - new Date(d.createdAt)) / DAY);
    const step = stepFor(ageDays);
    console.log(
      `  ${d.name.padEnd(30)} age=${String(ageDays).padStart(3)}d  aging=${d.agingEnabled ? 'ON ' : 'OFF'}` +
      `  ${step ? `[${step.label} ${step.percent}%]` : '[fresh]'}` +
      `  ${d.discountPrice != null ? `→ ₹${d.discountPrice} (was ₹${d.price})` : ''}`
    );
  }

  const onCount = docs.filter((d) => d.agingEnabled).length;
  console.log(`\n${onCount} with aging ON (should show on Aged Products / Clearance), ${docs.length - onCount} with aging OFF (should not).`);
  console.log(`Find them all with a name search for "${PREFIX}". Remove with: node scripts/seedAgingTestData.js --clean`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
