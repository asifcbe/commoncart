/**
 * seedAdmin — creates (or resets the password of) the admin login ONLY.
 * Connects to process.env.MONGODB_URI (the dev DB). Wipes nothing else.
 *
 * Run: node scripts/seedAdmin.js
 * Optional overrides: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME env vars.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const EMAIL = (process.env.ADMIN_EMAIL || 'admin@commoncart.com').toLowerCase().trim();
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const NAME = process.env.ADMIN_NAME || 'Admin User';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }
  // Guard: never let this run against the production URI by mistake.
  if (process.env.MONGODB_URIprod && uri === process.env.MONGODB_URIprod) {
    console.error('Refusing to run: MONGODB_URI equals MONGODB_URIprod.');
    process.exit(1);
  }

  console.log(`Connecting to dev DB (${uri.replace(/\/\/[^@]*@/, '//<credentials>@')})…`);
  await mongoose.connect(uri);
  console.log('Connected.');

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const admin = await User.findOneAndUpdate(
    { email: EMAIL },
    {
      $set: { name: NAME, passwordHash, role: 'ADMIN', isActive: true },
      $setOnInsert: { email: EMAIL },
    },
    { new: true, upsert: true }
  );

  console.log('\nAdmin ready:');
  console.log(`  _id:      ${admin._id}`);
  console.log(`  email:    ${admin.email}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  role:     ${admin.role}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => { console.error(err); process.exit(1); });
