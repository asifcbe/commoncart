/**
 * seedCategoryImages — generates a sample illustrative image for every
 * category and sub-category in CATEGORY_CONFIG that doesn't already have one,
 * and writes the paths back into the config.
 *
 *   node scripts/seedCategoryImages.js          # fill in missing images
 *   node scripts/seedCategoryImages.js --force  # regenerate ALL images
 *
 * Connects to process.env.MONGODB_URI (dev). Refuses the production URI.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AppSettings = require('../models/AppSettings');
const { makeCategoryPhoto } = require('./categoryPhotos');

async function run() {
  const force = process.argv.includes('--force');
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (process.env.MONGODB_URIprod && uri === process.env.MONGODB_URIprod) {
    console.error('Refusing to run against the production URI.'); process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected (${uri.replace(/\/\/[^@]*@/, '//<credentials>@')})${force ? ' — FORCE' : ''}`);

  const cfg = await AppSettings.get('CATEGORY_CONFIG', { categories: [] });
  const categories = Array.isArray(cfg?.categories) ? cfg.categories : [];
  if (!categories.length) { console.log('No categories in CATEGORY_CONFIG — nothing to do.'); await mongoose.disconnect(); return; }

  let made = 0;
  for (const c of categories) {
    if (force || !c.image) {
      c.image = await makeCategoryPhoto({ name: c.name, kind: 'category' });
      made++;
      console.log(`  cat  ${c.name.padEnd(22)} → ${c.image}`);
    }
    c.subImages = c.subImages && typeof c.subImages === 'object' ? c.subImages : {};
    for (const sub of c.subCategories || []) {
      if (force || !c.subImages[sub]) {
        c.subImages[sub] = await makeCategoryPhoto({ name: sub, kind: 'sub' });
        made++;
        console.log(`  sub  ${(c.name + ' / ' + sub).padEnd(34)} → ${c.subImages[sub]}`);
      }
    }
  }

  await AppSettings.set('CATEGORY_CONFIG', { categories });
  console.log(`\n${made} image(s) generated and saved to CATEGORY_CONFIG.`);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
