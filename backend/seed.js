/**
 * Seed script — wipes and repopulates the database with realistic data for
 * a KIDS CLOTHING shop (Tom & Jerry Kids Wear).
 *
 *   node seed.js
 *
 * Connects to process.env.MONGODB_URI (the dev DB). Refuses to run against
 * MONGODB_URIprod. Every product gets a generated sample photo.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const User = require('./models/User');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');
const Purchase = require('./models/Purchase');
const SaleTransaction = require('./models/SaleTransaction');
const StockMovement = require('./models/StockMovement');
const Customer = require('./models/Customer');
const Order = require('./models/Order');
const Coupon = require('./models/Coupon');
const AppSettings = require('./models/AppSettings');
const Attendance = require('./models/Attendance');
const SalaryPayment = require('./models/SalaryPayment');
const { makeProductPhoto } = require('./scripts/kidsPhotos');
const { makeCategoryPhoto } = require('./scripts/categoryPhotos');
// Return/Exchange/Replace and Purchase Return go through the real
// controllers (in-process, not over HTTP) instead of hand-building
// CreditNote/ReplacementNote/Settlement docs here — that math (GST
// itemization, netPayableRatio, points clawback, stock movements) is
// intricate and already correct in the controllers; duplicating it in the
// seed would just be a second place for it to drift out of sync.
const { processReturnSession } = require('./controllers/returnSessionController');
const { createPurchaseReturn } = require('./controllers/purchaseReturnController');

// ── helpers ──────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const chance = (p) => Math.random() < p;
const id6 = () => uuidv4().slice(0, 6).toUpperCase();
const DAY = 86400000;

// Minimal mock (req, res) so a real Express controller can be called
// in-process. `res.json`/`res.status().json()` resolves the returned promise
// with { statusCode, body } instead of writing to a socket.
function callController(fn, { body, user, io = { emit() {} } }) {
  return new Promise((resolve, reject) => {
    const req = { body, user, io };
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { resolve({ statusCode, body: payload }); },
    };
    Promise.resolve(fn(req, res)).catch(reject);
  });
}
let barcodeSeq = 4200000;
const nextBarcode = () => String(++barcodeSeq).padStart(7, '0');
let skuByCat = {};
const nextSku = (catCode, nameCode) => {
  const k = `${catCode}${nameCode}`;
  skuByCat[k] = (skuByCat[k] || 0) + 1;
  return `${k}-${String(skuByCat[k]).padStart(4, '0')}`;
};
const catCode = (c) => c.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
const nameCode = (n) => n.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();

// ── managed catalog ──────────────────────────────────────────
// Categories = age bands (how a kids-wear shop is browsed), sub-categories = garment types.
const CATEGORY_CATALOG = [
  { name: 'Newborn (0–3M)',   subCategories: ['Bodysuits', 'Sleepsuits', 'Mittens & Booties', 'Wrap Sets'] },
  { name: 'Infant (3–12M)',   subCategories: ['Rompers', 'T-Shirts', 'Leggings', 'Frocks', 'Jackets'] },
  { name: 'Toddler (1–3Y)',   subCategories: ['T-Shirts', 'Shorts', 'Dresses', 'Dungarees', 'Co-ord Sets', 'Hoodies'] },
  { name: 'Kids (3–8Y)',      subCategories: ['T-Shirts', 'Shirts', 'Jeans', 'Frocks', 'Track Pants', 'Jackets', 'Ethnic Wear'] },
  { name: 'Pre-Teen (8–14Y)', subCategories: ['T-Shirts', 'Shirts', 'Jeans', 'Kurtis', 'Sweatshirts', 'Joggers'] },
  { name: 'Accessories',      subCategories: ['Caps', 'Socks', 'Bibs', 'Booties'] },
];

const KID_COLORS = [
  'Sky Blue', 'Baby Pink', 'Mint', 'Yellow', 'Peach', 'Lavender', 'White', 'Red',
  'Navy', 'Sea Green', 'Coral', 'Mustard', 'Cream', 'Aqua', 'Denim', 'Charcoal',
];
const KID_SIZES = [
  '0–3M', '3–6M', '6–9M', '9–12M', '12–18M', '18–24M',
  '2Y', '3Y', '4Y', '5Y', '6Y', '7Y', '8Y', '10Y', '12Y', '14Y', 'Free Size',
];

// ── product lines ────────────────────────────────────────────
// shape = silhouette for the generated photo · sizes = which size band applies
const NEWBORN_SIZES = ['0–3M', '3–6M', '6–9M'];
const INFANT_SIZES = ['3–6M', '6–9M', '9–12M', '12–18M'];
const TODDLER_SIZES = ['12–18M', '18–24M', '2Y', '3Y'];
const KIDS_SIZES = ['3Y', '4Y', '5Y', '6Y', '7Y', '8Y'];
const PRETEEN_SIZES = ['8Y', '10Y', '12Y', '14Y'];

const PRODUCT_LINES = [
  // Newborn
  { name: 'Organic Cotton Bodysuit',   category: 'Newborn (0–3M)', subCategory: 'Bodysuits',        shape: 'onesie', cost: 120, price: 299, sizes: NEWBORN_SIZES, colors: ['White', 'Baby Pink', 'Sky Blue', 'Mint'], hsn: '6111' },
  { name: 'Full-Sleeve Sleepsuit',     category: 'Newborn (0–3M)', subCategory: 'Sleepsuits',       shape: 'onesie', cost: 210, price: 499, sizes: NEWBORN_SIZES, colors: ['Sky Blue', 'Peach', 'Lavender', 'Yellow'], hsn: '6111' },
  { name: 'Newborn Wrap Gift Set',     category: 'Newborn (0–3M)', subCategory: 'Wrap Sets',        shape: 'set',    cost: 380, price: 899, sizes: ['0–3M', '3–6M'], colors: ['Cream', 'Baby Pink', 'Sky Blue'], hsn: '6209' },
  { name: 'Soft Mittens & Booties',    category: 'Newborn (0–3M)', subCategory: 'Mittens & Booties', shape: 'socks',  cost: 70,  price: 179, sizes: ['0–3M', '3–6M'], colors: ['White', 'Mint', 'Peach'], hsn: '6111' },
  // Infant
  { name: 'Half-Sleeve Cotton Romper', category: 'Infant (3–12M)', subCategory: 'Rompers',          shape: 'onesie', cost: 160, price: 399, sizes: INFANT_SIZES, colors: ['Yellow', 'Aqua', 'Coral', 'Sky Blue', 'Mint'], hsn: '6111' },
  { name: 'Printed Infant T-Shirt',    category: 'Infant (3–12M)', subCategory: 'T-Shirts',         shape: 'tee',    cost: 90,  price: 249, sizes: INFANT_SIZES, colors: ['Red', 'Navy', 'Mint', 'Mustard', 'White'], hsn: '6109' },
  { name: 'Ribbed Baby Leggings',      category: 'Infant (3–12M)', subCategory: 'Leggings',         shape: 'pants',  cost: 85,  price: 229, sizes: INFANT_SIZES, colors: ['Charcoal', 'Navy', 'Baby Pink', 'Sea Green'], hsn: '6111' },
  { name: 'Floral Infant Frock',       category: 'Infant (3–12M)', subCategory: 'Frocks',           shape: 'dress',  cost: 230, price: 549, sizes: INFANT_SIZES, colors: ['Baby Pink', 'Lavender', 'Yellow', 'Peach'], hsn: '6111' },
  { name: 'Fleece Infant Jacket',      category: 'Infant (3–12M)', subCategory: 'Jackets',          shape: 'jacket', cost: 280, price: 699, sizes: INFANT_SIZES, colors: ['Navy', 'Coral', 'Mint', 'Charcoal'], hsn: '6110' },
  // Toddler
  { name: 'Graphic Toddler T-Shirt',   category: 'Toddler (1–3Y)', subCategory: 'T-Shirts',         shape: 'tee',    cost: 110, price: 299, sizes: TODDLER_SIZES, colors: ['Red', 'Sky Blue', 'Yellow', 'Sea Green', 'White'], hsn: '6109' },
  { name: 'Cotton Play Shorts',        category: 'Toddler (1–3Y)', subCategory: 'Shorts',           shape: 'shorts', cost: 95,  price: 249, sizes: TODDLER_SIZES, colors: ['Navy', 'Mustard', 'Aqua', 'Charcoal'], hsn: '6203' },
  { name: 'Frill Sleeve Toddler Dress',category: 'Toddler (1–3Y)', subCategory: 'Dresses',          shape: 'dress',  cost: 260, price: 599, sizes: TODDLER_SIZES, colors: ['Baby Pink', 'Coral', 'Lavender', 'Cream'], hsn: '6104' },
  { name: 'Denim Dungarees',           category: 'Toddler (1–3Y)', subCategory: 'Dungarees',        shape: 'set',    cost: 340, price: 799, sizes: TODDLER_SIZES, colors: ['Denim', 'Sky Blue'], hsn: '6203' },
  { name: 'Cotton Co-ord Set',         category: 'Toddler (1–3Y)', subCategory: 'Co-ord Sets',      shape: 'set',    cost: 300, price: 749, sizes: TODDLER_SIZES, colors: ['Mint', 'Peach', 'Yellow', 'Sky Blue'], hsn: '6209' },
  { name: 'Zip Hoodie',                category: 'Toddler (1–3Y)', subCategory: 'Hoodies',          shape: 'hoodie', cost: 320, price: 799, sizes: TODDLER_SIZES, colors: ['Charcoal', 'Navy', 'Coral', 'Aqua'], hsn: '6110' },
  // Kids
  { name: 'Boys Half-Sleeve T-Shirt',  category: 'Kids (3–8Y)',    subCategory: 'T-Shirts',         shape: 'tee',    cost: 140, price: 349, sizes: KIDS_SIZES, colors: ['Navy', 'Red', 'White', 'Sea Green', 'Mustard'], hsn: '6109' },
  { name: 'Checked Casual Shirt',      category: 'Kids (3–8Y)',    subCategory: 'Shirts',           shape: 'jacket', cost: 220, price: 549, sizes: KIDS_SIZES, colors: ['Sky Blue', 'Red', 'Charcoal'], hsn: '6205' },
  { name: 'Slim-Fit Kids Jeans',       category: 'Kids (3–8Y)',    subCategory: 'Jeans',            shape: 'pants',  cost: 300, price: 749, sizes: KIDS_SIZES, colors: ['Denim', 'Charcoal', 'Sky Blue'], hsn: '6203' },
  { name: 'Girls Party Frock',         category: 'Kids (3–8Y)',    subCategory: 'Frocks',           shape: 'dress',  cost: 420, price: 999, sizes: KIDS_SIZES, colors: ['Baby Pink', 'Lavender', 'Coral', 'Cream'], hsn: '6104' },
  { name: 'Kids Track Pants',          category: 'Kids (3–8Y)',    subCategory: 'Track Pants',      shape: 'pants',  cost: 180, price: 449, sizes: KIDS_SIZES, colors: ['Charcoal', 'Navy', 'Sea Green', 'Coral'], hsn: '6211' },
  { name: 'Puffer Jacket',             category: 'Kids (3–8Y)',    subCategory: 'Jackets',          shape: 'jacket', cost: 480, price: 1199, sizes: KIDS_SIZES, colors: ['Navy', 'Coral', 'Charcoal', 'Mustard'], hsn: '6201' },
  { name: 'Festive Kurta Pyjama Set',  category: 'Kids (3–8Y)',    subCategory: 'Ethnic Wear',      shape: 'set',    cost: 520, price: 1299, sizes: KIDS_SIZES, colors: ['Cream', 'Mustard', 'Sea Green'], hsn: '6203' },
  // Pre-Teen
  { name: 'Oversized Graphic Tee',     category: 'Pre-Teen (8–14Y)', subCategory: 'T-Shirts',       shape: 'tee',    cost: 190, price: 499, sizes: PRETEEN_SIZES, colors: ['White', 'Charcoal', 'Sea Green', 'Coral'], hsn: '6109' },
  { name: 'Cotton Casual Shirt',       category: 'Pre-Teen (8–14Y)', subCategory: 'Shirts',         shape: 'jacket', cost: 280, price: 699, sizes: PRETEEN_SIZES, colors: ['Sky Blue', 'White', 'Navy'], hsn: '6205' },
  { name: 'Stretch Denim Jeans',       category: 'Pre-Teen (8–14Y)', subCategory: 'Jeans',          shape: 'pants',  cost: 360, price: 899, sizes: PRETEEN_SIZES, colors: ['Denim', 'Charcoal'], hsn: '6203' },
  { name: 'Girls Printed Kurti',       category: 'Pre-Teen (8–14Y)', subCategory: 'Kurtis',         shape: 'dress',  cost: 300, price: 749, sizes: PRETEEN_SIZES, colors: ['Baby Pink', 'Mustard', 'Sea Green', 'Lavender'], hsn: '6106' },
  { name: 'Fleece Sweatshirt',         category: 'Pre-Teen (8–14Y)', subCategory: 'Sweatshirts',    shape: 'hoodie', cost: 340, price: 849, sizes: PRETEEN_SIZES, colors: ['Charcoal', 'Navy', 'Coral', 'Mint'], hsn: '6110' },
  { name: 'Tapered Joggers',           category: 'Pre-Teen (8–14Y)', subCategory: 'Joggers',        shape: 'pants',  cost: 240, price: 599, sizes: PRETEEN_SIZES, colors: ['Charcoal', 'Navy', 'Sea Green'], hsn: '6211' },
  // Accessories
  { name: 'Kids Cotton Cap',           category: 'Accessories', subCategory: 'Caps',    shape: 'cap',   cost: 60,  price: 179, sizes: ['Free Size'], colors: ['Red', 'Navy', 'Yellow', 'Mint'], hsn: '6505' },
  { name: 'Pack of 3 Ankle Socks',     category: 'Accessories', subCategory: 'Socks',   shape: 'socks', cost: 70,  price: 199, sizes: ['Free Size'], colors: ['White', 'Charcoal', 'Sky Blue'], hsn: '6115' },
  { name: 'Waterproof Feeding Bib',    category: 'Accessories', subCategory: 'Bibs',    shape: 'tee',   cost: 45,  price: 149, sizes: ['Free Size'], colors: ['Yellow', 'Mint', 'Coral', 'Sky Blue'], hsn: '6209' },
  { name: 'Anti-Slip Baby Booties',    category: 'Accessories', subCategory: 'Booties', shape: 'socks', cost: 80,  price: 229, sizes: ['0–3M', '3–6M', '6–9M'], colors: ['Baby Pink', 'Sky Blue', 'Cream'], hsn: '6111' },
];

const SUPPLIER_DEFS = [
  { name: 'Tirupur Kids Knitwear', contactPerson: 'S. Karthik', phone: '9842011223', email: 'karthik@tirupurkids.in', gstin: '33AAACT1234K1Z5', address: '14, Knit City, Tirupur - 641604' },
  { name: 'Little Threads Mfg. Co.', contactPerson: 'Neha Bansal', phone: '9811044556', email: 'neha@littlethreads.in', gstin: '07AABCL9876M1Z3', address: '9, Garment Block, Gandhi Nagar, Delhi - 110031' },
  { name: 'Ludhiana Winterwear',  contactPerson: 'Harpreet Singh', phone: '9878012345', email: 'harpreet@ldhwinter.in', gstin: '03AACCL4567P1ZQ', address: '22, Woollen Market, Ludhiana - 141008' },
  { name: 'Jaipur Ethnic Kids',   contactPerson: 'Pooja Rathore', phone: '9829033445', email: 'pooja@jaipurethnickids.in', gstin: '08AAECJ7654R1ZL', address: '5, Bapu Bazaar, Jaipur - 302003' },
  { name: 'BabyCare Essentials',  contactPerson: 'Manish Gupta', phone: '9900022110', email: 'manish@babycareess.in', gstin: '29AAFCB3210T1ZK', address: '31, MG Road, Bengaluru - 560001' },
];

const CUSTOMER_DEFS = [
  { name: 'Aisha Khan',      email: 'aisha.khan@gmail.com',   phone: '9876500011' },
  { name: 'Rahul Verma',     email: 'rahul.verma@gmail.com',  phone: '9876500022' },
  { name: 'Meera Nair',      email: 'meera.nair@gmail.com',   phone: '9876500033' },
  { name: 'Sana Sheikh',     email: 'sana.sheikh@yahoo.com',  phone: '9876500044' },
  { name: 'Karan Malhotra',  email: 'karan.m@outlook.com',    phone: '9876500055' },
  { name: 'Divya Menon',     email: 'divya.menon@gmail.com',  phone: '9876500066' },
  { name: 'Farhan Ali',      email: 'farhan.ali@gmail.com',   phone: '9876500077' },
  { name: 'Priyanka Rao',    email: 'priyanka.rao@gmail.com', phone: '9876500088' },
  { name: 'Nikhil Joshi',    email: 'nikhil.joshi@gmail.com', phone: '9876500099' },
  { name: 'Ritika Sharma',   email: 'ritika.sharma@gmail.com',phone: '9876500100' },
];

const AGING_STEPS = [
  { days: 30,  label: 'Fresh (30 days)',           percent: 0  },
  { days: 60,  label: 'Slow-moving (60 days)',      percent: 5  },
  { days: 90,  label: 'Clearance (90 days)',        percent: 10 },
  { days: 120, label: 'Heavy Discount (120 days)',  percent: 15 },
  { days: 180, label: 'Half-Year Sale (180 days)',  percent: 20 },
  { days: 365, label: 'Annual Clearance (1 Year)',  percent: 30 },
  { days: 730, label: 'Deep Clearance (2+ Years)',  percent: 50 },
];
// Age (days) each purchase batch is backdated to, so aging buckets are covered.
const PURCHASE_AGE_BUCKETS = [8, 20, 45, 75, 100, 140, 183, 260, 400, 800];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (process.env.MONGODB_URIprod && uri === process.env.MONGODB_URIprod) {
    console.error('Refusing to run against the production URI.'); process.exit(1);
  }

  console.log('Connecting…');
  await mongoose.connect(uri);
  console.log(`Connected (${uri.replace(/\/\/[^@]*@/, '//<credentials>@')})\n`);

  // ── wipe ──────────────────────────────────────────────────
  console.log('Clearing data…');
  const collections = ['products', 'suppliers', 'purchases', 'saletransactions', 'stockmovements',
    'customers', 'orders', 'coupons', 'appsettings', 'creditnotes', 'replacementnotes', 'settlements',
    'salereturns', 'exchanges', 'purchasereturns', 'salarypayments', 'attendances', 'counters'];
  for (const c of collections) {
    try { await mongoose.connection.db.collection(c).deleteMany({}); } catch { /* may not exist */ }
  }
  // Wipe old product + category photos on disk
  for (const sub of ['products', 'categories']) {
    const dir = path.join(__dirname, 'uploads', sub);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (f !== '.gitkeep') { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } }
    }
  }
  console.log('Cleared (data + product & category photos).\n');

  // ── users / staff ─────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const staffHash = await bcrypt.hash('Staff@123', 12);
  const admin = await User.findOneAndUpdate(
    { email: 'admin@commoncart.com' },
    {
      name: 'Store Admin', passwordHash: adminHash, role: 'ADMIN', isActive: true,
      phone: '9900011111', monthlySalary: 45000, joinDate: new Date(Date.now() - 900 * 86400000),
    },
    { new: true, upsert: true }
  );
  const staff = await User.findOneAndUpdate(
    { email: 'staff@commoncart.com' },
    {
      name: 'Shop Staff', passwordHash: staffHash, role: 'STAFF', isActive: true,
      phone: '9900022222', monthlySalary: 18000, joinDate: new Date(Date.now() - 400 * 86400000),
      permissions: {
        sections: ['dashboard', 'pos', 'products', 'purchases', 'suppliers', 'inventory', 'sales', 'web-orders', 'customers'],
        viewCostPrice: false, canManage: true,
      },
    },
    { new: true, upsert: true }
  );
  // A few more staff — varied roles/permissions/tenure so Staff, Attendance
  // and Salary screens all have more than one person to show.
  const STAFF_DEFS = [
    {
      email: 'cashier@commoncart.com', name: 'Priya Cashier', phone: '9900033333',
      monthlySalary: 15000, joinDateDaysAgo: 250,
      permissions: { sections: ['dashboard', 'pos', 'sales'], viewCostPrice: false, canManage: false },
    },
    {
      email: 'inventory@commoncart.com', name: 'Arjun Stock Keeper', phone: '9900044444',
      monthlySalary: 20000, joinDateDaysAgo: 600,
      permissions: { sections: ['dashboard', 'products', 'purchases', 'suppliers', 'inventory', 'aged-products'], viewCostPrice: true, canManage: true },
    },
    {
      email: 'exstaff@commoncart.com', name: 'Vikram Former Staff', phone: '9900055555',
      monthlySalary: 16000, joinDateDaysAgo: 500, isActive: false,
      permissions: { sections: ['dashboard', 'pos'], viewCostPrice: false, canManage: false },
    },
  ];
  const extraStaff = [];
  for (const s of STAFF_DEFS) {
    const u = await User.findOneAndUpdate(
      { email: s.email },
      {
        name: s.name, passwordHash: staffHash, role: 'STAFF', isActive: s.isActive !== false,
        phone: s.phone, monthlySalary: s.monthlySalary, joinDate: new Date(Date.now() - s.joinDateDaysAgo * DAY),
        permissions: s.permissions,
      },
      { new: true, upsert: true }
    );
    extraStaff.push(u);
  }
  const allStaff = [staff, ...extraStaff]; // admin excluded — attendance/salary are staff-only concepts here
  console.log('Users:  admin@commoncart.com / Admin@123   ·   staff@commoncart.com / Staff@123   ·   3 more staff / Staff@123 (one inactive)');

  // ── settings ──────────────────────────────────────────────
  console.log('\nSettings…');
  await AppSettings.set('BUSINESS_CONFIG', {
    businessName: 'Tom & Jerry Kids Wear',
    addressLine: 'Shop 4, Little Steps Plaza, MG Road',
    phone: '+91 90000 00000',
    email: 'hello@tomandjerry.in',
    gstin: '29ABCDE1234F1Z5',
    gstEnabled: true,
    gstPercent: 5,           // most kids garments in India: 5% GST
    gstInclusive: true,
    defaultHsnCode: '6111',  // babies' garments, knitted
    stateName: 'Karnataka',
    footerNote: 'Thank you — dress up those little smiles! · tomandjerry.in',
  });
  // Generate a sample illustrative image for every category + sub-category.
  const categoryCatalog = [];
  for (const c of CATEGORY_CATALOG) {
    const image = await makeCategoryPhoto({ name: c.name, kind: 'category' });
    const subImages = {};
    for (const sub of c.subCategories) subImages[sub] = await makeCategoryPhoto({ name: sub, kind: 'sub' });
    categoryCatalog.push({ name: c.name, image, subCategories: c.subCategories, subImages });
  }
  await AppSettings.set('CATEGORY_CONFIG', { categories: categoryCatalog });
  await AppSettings.set('VARIANT_CONFIG', { variants: KID_COLORS, sizes: KID_SIZES, variantSelectorEnabled: true });
  await AppSettings.set('CREDIT_CONFIG', { pointsPerAmount: 1, perRupees: 200, rupeesPerPoint: 200, pointValue: 1 }); // earn 1 pt / ₹200, 1 pt = ₹1
  await AppSettings.set('PRICE_AGING_CONFIG', { enabled: true, steps: AGING_STEPS });
  await AppSettings.set('AUTO_DELETE_CONFIG', { enabled: false, days: 30 });
  await AppSettings.set('PAYMENT_MODES_CONFIG', {
    modes: [{ key: 'CASH', label: 'Cash' }, { key: 'CARD', label: 'Card' }, { key: 'UPI', label: 'UPI' }, { key: 'OTHER', label: 'Other' }],
  });
  await AppSettings.set('DISPLAY_CONFIG', { dateFormat: 'DD/MM/YYYY' });
  console.log(`  business (GST 5% incl), categories (${categoryCatalog.length} age bands, with images), colors/sizes, credit, aging (on), payment modes`);

  // ── suppliers ─────────────────────────────────────────────
  const suppliers = await Supplier.insertMany(SUPPLIER_DEFS.map((s) => ({ ...s, balance: 0, isActive: true })));
  console.log(`\nSuppliers: ${suppliers.length}`);
  const supplierForCategory = {
    'Newborn (0–3M)': suppliers[4],
    'Infant (3–12M)': suppliers[0],
    'Toddler (1–3Y)': suppliers[0],
    'Kids (3–8Y)': suppliers[1],
    'Pre-Teen (8–14Y)': suppliers[1],
    'Accessories': suppliers[4],
  };
  const winterSupplier = suppliers[2];   // jackets / sweatshirts
  const ethnicSupplier = suppliers[3];   // ethnic wear

  // ── products + purchases + photos ────────────────────────
  console.log('\nProducts, purchases & photos…');
  const allUnitProducts = [];   // every qty:1 unit-product doc
  const allPurchases = [];      // every created Purchase doc, for Purchase Returns later
  let purchaseCount = 0;
  let photoCount = 0;
  const nowTs = Date.now();

  for (const line of PRODUCT_LINES) {
    let supplier = supplierForCategory[line.category];
    if (line.subCategory === 'Jackets' || line.subCategory === 'Sweatshirts') supplier = winterSupplier;
    if (line.subCategory === 'Ethnic Wear') supplier = ethnicSupplier;

    // Each product line lands in ONE age bucket (one purchase batch), so
    // aging bucket coverage is deterministic across the catalogue.
    const ageDays = PURCHASE_AGE_BUCKETS[purchaseCount % PURCHASE_AGE_BUCKETS.length];
    const purchaseDate = new Date(nowTs - ageDays * DAY);
    // ~45% of lines opt into Price Aging.
    const agingEnabled = chance(0.45);
    // ~10% of lines are marked "No Exchange" at purchase-entry time.
    const exchangeable = !chance(0.10);

    // Generate ONE photo per (line, colour) — shared across its size variants.
    const photoByColor = {};
    for (const color of line.colors) {
      photoByColor[color] = await makeProductPhoto({ name: line.name, shape: line.shape, colorName: color, variant: 0 });
      photoCount++;
    }

    const unitDocs = [];
    const purchaseItems = [];
    for (const color of line.colors) {
      for (const size of line.sizes) {
        const units = rand(3, 12); // this many physical pieces of this variant
        const cc = catCode(line.category);
        const nc = nameCode(line.name);
        for (let u = 0; u < units; u++) {
          unitDocs.push({
            name: line.name,
            description: `${line.name} — soft, breathable ${line.category.split(' ')[0].toLowerCase()} wear. Easy wash, tag-free comfort.`,
            category: line.category,
            subCategory: line.subCategory,
            hsnCode: line.hsn,
            gstPercent: null, // use shop default (5%)
            SKU: nextSku(cc, nc),
            barcode: nextBarcode(),
            price: line.price,
            costPrice: line.cost,
            quantity: 1,
            reservedQty: 0,
            images: [photoByColor[color]],
            supplier: supplier.name,
            lowStockThreshold: 2,
            isActive: true,
            isWebVisible: true,
            color,
            size,
            discountPrice: null,
            manualDiscountPrice: null,
            agingEnabled,
            agingBaseDate: purchaseDate,
            exchangeable,
          });
        }
      }
    }

    const created = await Product.insertMany(unitDocs);
    // Force createdAt to the purchase date too (insertMany stamps "now").
    await Product.collection.updateMany(
      { _id: { $in: created.map((c) => c._id) } },
      { $set: { createdAt: purchaseDate } }
    );
    allUnitProducts.push(...created);

    // Roll up into purchase line items (one per variant, qty = units).
    const byVariant = {};
    for (const c of created) {
      const k = `${c.color}|${c.size}`;
      if (!byVariant[k]) byVariant[k] = { productIds: [], color: c.color, size: c.size };
      byVariant[k].productIds.push(c._id);
    }
    for (const v of Object.values(byVariant)) {
      purchaseItems.push({
        productId: v.productIds[0],
        name: line.name, category: line.category, subCategory: line.subCategory,
        hsnCode: line.hsn, gstPercent: null,
        description: '', qty: v.productIds.length,
        costPrice: line.cost, price: line.price, color: v.color, size: v.size,
        discountPrice: null, barcode: '',
      });
    }
    const totalCost = purchaseItems.reduce((s, it) => s + it.qty * it.costPrice, 0);
    const purchaseId = `PUR-${String(purchaseDate.getFullYear()).slice(2)}${String(purchaseDate.getMonth() + 1).padStart(2, '0')}-${String(++purchaseCount).padStart(4, '0')}`;
    const purchaseDoc = await Purchase.create({
      purchaseId, supplierId: supplier._id, supplier: supplier.name,
      purchaseDate, items: purchaseItems, totalCost,
      note: `Stock intake — ${line.name}`, purchasedBy: admin._id,
      createdAt: purchaseDate, updatedAt: purchaseDate,
    });
    allPurchases.push(purchaseDoc);
    await Supplier.findByIdAndUpdate(supplier._id, { $inc: { balance: totalCost } });
    for (const it of purchaseItems) {
      await StockMovement.create({
        productId: it.productId, type: 'RESTOCK', channel: 'SYSTEM',
        quantityChanged: it.qty, previousQty: 0, newQty: it.qty,
        note: `Purchase ${purchaseId}`, performedBy: admin._id, transactionId: purchaseId,
        createdAt: purchaseDate,
      });
    }
    process.stdout.write('.');
  }
  console.log(`\n  ${allUnitProducts.length} unit-products across ${PRODUCT_LINES.length} lines · ${purchaseCount} purchases · ${photoCount} photos generated`);

  // ── manual promo discounts on a few product lines (shop-set, NOT aging) ──
  // Set the manual discount first so the aging pass below can age down FROM it.
  console.log('\nApplying discounts…');
  const promoNames = new Set();
  {
    const pool = await Product.find({ isActive: true }).select('_id name price costPrice').lean();
    for (const p of pool) {
      if (promoNames.size < 4 && chance(0.01)) promoNames.add(p.name);
    }
  }
  let promoCount = 0;
  for (const name of promoNames) {
    const rows = await Product.find({ name, isActive: true }).select('_id price costPrice');
    for (const p of rows) {
      const promo = Math.round(Math.max(p.costPrice, p.price * 0.85) * 100) / 100; // 15% festive off
      if (promo < p.price) {
        await Product.updateOne({ _id: p._id }, { $set: { discountPrice: promo, manualDiscountPrice: promo } });
        promoCount++;
      }
    }
  }
  console.log(`  ${promoCount} unit-products on manual festive promo (${[...promoNames].join(', ') || 'none'})`);

  // ── aging discounts — only agingEnabled, measured from agingBaseDate,
  //    aged DOWN FROM the manual discount when there is one, else from MRP.
  //    Not gated by web visibility.
  const sorted = [...AGING_STEPS].sort((a, b) => b.days - a.days);
  let agedApplied = 0;
  const agingProducts = await Product.find({ isActive: true, agingEnabled: true });
  for (const p of agingProducts) {
    const ageDays = (nowTs - new Date(p.agingBaseDate || p.createdAt)) / DAY;
    const step = sorted.find((s) => ageDays >= s.days && s.percent > 0);
    if (!step) continue;
    const base = (p.manualDiscountPrice != null && p.manualDiscountPrice > 0) ? p.manualDiscountPrice : p.price;
    // Step % applied exactly — not floored at cost (mirrors applyAgingNow).
    const rounded = Math.max(0, Math.round(base * (1 - step.percent / 100) * 100) / 100);
    if (rounded < base) {
      await Product.updateOne({ _id: p._id }, { $set: { discountPrice: rounded, isAged: true } });
      agedApplied++;
    }
  }
  console.log(`  ${agedApplied} unit-products auto-discounted by age`);

  // supplier part-payments
  for (const sup of suppliers) {
    const owed = (await Supplier.findById(sup._id)).balance;
    const paid = Math.floor(owed * (0.4 + Math.random() * 0.3));
    if (paid > 0) {
      await Supplier.findByIdAndUpdate(sup._id, {
        $inc: { balance: -paid },
        $push: { payments: {
          amount: paid, method: pick(['CASH', 'BANK_TRANSFER', 'UPI']),
          reference: `REF-${id6()}`, note: 'Part payment against stock',
          recordedBy: admin._id, createdAt: new Date(nowTs - rand(1, 20) * DAY), updatedAt: new Date(),
        } },
      });
    }
  }

  // ── customers ─────────────────────────────────────────────
  console.log('\nCustomers…');
  const custHash = await bcrypt.hash('Customer@123', 10);
  const CITIES = [['Bengaluru', 'Karnataka'], ['Mumbai', 'Maharashtra'], ['Chennai', 'Tamil Nadu'], ['Hyderabad', 'Telangana'], ['Pune', 'Maharashtra'], ['Kochi', 'Kerala']];
  const customers = await Customer.insertMany(CUSTOMER_DEFS.map((c) => {
    const [city, state] = pick(CITIES);
    return {
      ...c, passwordHash: custHash, creditPoints: rand(0, 120), isActive: true,
      addresses: [{
        fullName: c.name, phone: c.phone,
        line1: `${rand(1, 240)}, ${pick(['Rose', 'Lake View', 'Green Park', 'MG', 'Church'])} Street`,
        line2: pick(['', 'Near City Mall', 'Opp. Play School', '2nd Floor']),
        city, state, zip: String(rand(500001, 682099)), country: 'IN', isDefault: true,
      }],
    };
  }));
  console.log(`  ${customers.length} customers (password: Customer@123)`);

  // ── POS sales (last 21 days) ─────────────────────────────
  console.log('\nPOS sales…');
  const shopGst = { enabled: true, percent: 5, inclusive: true, cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 0, gstin: '29ABCDE1234F1Z5', stateName: 'Karnataka' };
  const CUSTOM_ITEM_DEFS = [
    { name: 'Gift Wrap', price: 49 }, { name: 'Alteration Charge', price: 99 }, { name: 'Loyalty Gift Card', price: 200 },
  ];
  let saleCount = 0;
  let saleLineSeq = 0;
  const allSales = []; // every created SaleTransaction doc, for Return/Exchange/Replace sessions later
  for (let d = 21; d >= 0; d--) {
    for (let s = 0, n = rand(2, 7); s < n; s++) {
      // Pull DISTINCT in-stock unit-products
      const inStock = allUnitProducts.filter((p) => p.quantity > 0);
      if (!inStock.length) break;
      const lines = [];
      const usedIds = new Set();
      for (let i = 0, want = rand(1, 3); i < want; i++) {
        const p = pick(inStock);
        if (usedIds.has(String(p._id))) continue;
        usedIds.add(String(p._id));
        const fresh = await Product.findById(p._id).lean();
        if (!fresh || fresh.quantity < 1) continue;
        const unit = fresh.discountPrice ?? fresh.price;
        lines.push({
          productId: fresh._id, custom: false, lineId: `Lseed${++saleLineSeq}`,
          barcode: fresh.barcode, name: `${fresh.name} (${fresh.color}/${fresh.size})`,
          qty: 1, price: unit, isDiscounted: fresh.discountPrice != null,
          noExchange: fresh.exchangeable === false,
          hsnCode: fresh.hsnCode || '6111', gstPercent: null,
        });
        p.quantity = 0; // local bookkeeping so we don't pick it again this run
      }
      // ~15% of sales also ring up a custom, no-barcode POS line (e.g. gift
      // wrap) — untracked stock, still taxed, still earns points.
      if (chance(0.15)) {
        const c = pick(CUSTOM_ITEM_DEFS);
        lines.push({
          productId: null, custom: true, lineId: `Lseed${++saleLineSeq}c`,
          barcode: '', name: c.name, qty: 1, price: c.price, mrp: c.price,
          isDiscounted: false, noExchange: false, hsnCode: '', gstPercent: null,
        });
      }
      if (!lines.length) continue;

      const goods = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const txnDate = new Date(); txnDate.setDate(txnDate.getDate() - d); txnDate.setHours(rand(10, 20), rand(0, 59), 0, 0);
      const cust = chance(0.55) ? pick(customers) : null;
      const txnId = `INV-${String(txnDate.getFullYear()).slice(2)}${String(txnDate.getMonth() + 1).padStart(2, '0')}${String(++saleCount).padStart(4, '0')}`;

      const saleDoc = await SaleTransaction.create({
        transactionId: txnId, channel: 'STORE', items: lines, totalAmount: goods,
        paymentMethod: pick(['CASH', 'CARD', 'UPI', 'UPI', 'CASH']), status: 'COMPLETED',
        soldBy: chance(0.6) ? staff._id : admin._id,
        customerId: cust?._id || null, customerPhone: cust?.phone || '', customerName: cust?.name || '',
        couponCode: '', discountAmount: 0, roundOffAmount: 0,
        creditPointsEarned: Math.floor(goods / 200), creditPointsRedeemed: 0,
        note: '', gst: shopGst, createdAt: txnDate, updatedAt: txnDate,
      });
      allSales.push(saleDoc);
      for (const l of lines) {
        if (!l.productId) continue; // custom line — no stock to move
        await Product.updateOne({ _id: l.productId }, { $inc: { quantity: -l.qty } });
        await StockMovement.create({
          productId: l.productId, type: 'SALE', channel: 'STORE', quantityChanged: -l.qty,
          previousQty: 1, newQty: 0, note: `POS Sale ${txnId}`, performedBy: staff._id,
          transactionId: txnId, createdAt: txnDate,
        });
      }
      if (cust) await Customer.updateOne({ _id: cust._id }, { $inc: { creditPoints: Math.floor(goods / 200) } });
      saleCount === 0; // no-op
    }
  }
  console.log(`  ${saleCount} store sales`);

  // ── web orders (last 21 days) ────────────────────────────
  console.log('\nWeb orders…');
  const fulfil = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'SHIPPED', 'PROCESSING', 'PENDING', 'CANCELLED'];
  let orderCount = 0;
  for (let d = 21; d >= 0; d--) {
    for (let o = 0, n = rand(1, 3); o < n; o++) {
      const cust = pick(customers);
      const pool = allUnitProducts.filter((p) => p.quantity > 0 || true); // web orders may reserve; keep it simple
      const picks = [];
      const seen = new Set();
      for (let i = 0, want = rand(1, 3); i < want; i++) {
        const p = pick(pool);
        if (seen.has(p.name + p.color)) continue;
        seen.add(p.name + p.color);
        const fresh = await Product.findById(p._id).lean();
        if (!fresh) continue;
        const unit = fresh.discountPrice ?? fresh.price;
        picks.push({
          productId: fresh._id, name: `${fresh.name} (${fresh.color}/${fresh.size})`, barcode: fresh.barcode,
          price: unit, mrp: fresh.price, isDiscounted: fresh.discountPrice != null, qty: 1,
          image: fresh.images?.[0] || '', hsnCode: fresh.hsnCode || '6111', gstPercent: null,
        });
      }
      if (!picks.length) continue;
      const subtotal = picks.reduce((s, i) => s + i.price * i.qty, 0);
      const shippingCost = subtotal >= 999 ? 0 : 49;
      const total = subtotal + shippingCost;
      const f = pick(fulfil);
      const payStatus = ['DELIVERED', 'SHIPPED', 'PROCESSING'].includes(f) ? 'PAID' : f === 'CANCELLED' ? 'REFUNDED' : 'PENDING';
      const orderDate = new Date(); orderDate.setDate(orderDate.getDate() - d); orderDate.setHours(rand(9, 22), rand(0, 59), 0, 0);
      const orderId = `ORD-${String(orderDate.getFullYear()).slice(2)}${String(orderDate.getMonth() + 1).padStart(2, '0')}${String(++orderCount).padStart(4, '0')}`;

      await Order.create({
        orderId, customerId: cust._id, channel: 'WEB', items: picks,
        shippingAddress: cust.addresses[0], subtotal, shippingCost, totalAmount: total,
        paymentMethod: pick(['COD', 'ONLINE', 'CARD']), paymentStatus: payStatus, fulfillmentStatus: f,
        stockReserved: false, stockDeducted: payStatus === 'PAID', note: '',
        couponCode: '', discountAmount: 0,
        creditPointsEarned: payStatus === 'PAID' ? Math.floor(total / 200) : 0,
        createdAt: orderDate, updatedAt: orderDate,
      });
    }
  }
  console.log(`  ${orderCount} web orders`);

  // ── coupons ───────────────────────────────────────────────
  await Coupon.insertMany([
    { code: 'FIRSTSTEP', description: '15% off your first order', type: 'PERCENTAGE', value: 15, minOrderAmount: 499, maxDiscountAmount: 300, maxUses: 500, usedCount: 37, isActive: true, createdBy: admin._id, expiresAt: new Date(nowTs + 60 * DAY) },
    { code: 'BABY100',   description: 'Flat ₹100 off on ₹799+', type: 'FIXED_AMOUNT', value: 100, minOrderAmount: 799, maxDiscountAmount: 0, maxUses: 300, usedCount: 21, isActive: true, createdBy: admin._id, expiresAt: new Date(nowTs + 45 * DAY) },
    { code: 'BUNDLE20',  description: '20% off on 3+ items (₹1499+)', type: 'PERCENTAGE', value: 20, minOrderAmount: 1499, maxDiscountAmount: 600, maxUses: 200, usedCount: 9, isActive: true, createdBy: admin._id, expiresAt: new Date(nowTs + 90 * DAY) },
    { code: 'WINTER10',  description: '10% off jackets & sweatshirts', type: 'PERCENTAGE', value: 10, minOrderAmount: 699, maxDiscountAmount: 250, maxUses: 400, usedCount: 52, isActive: true, createdBy: admin._id, expiresAt: new Date(nowTs + 30 * DAY) },
    { code: 'DIWALI25',  description: 'Expired festive 25% off', type: 'PERCENTAGE', value: 25, minOrderAmount: 999, maxDiscountAmount: 500, maxUses: 100, usedCount: 100, isActive: false, createdBy: admin._id, expiresAt: new Date(nowTs - 12 * DAY) },
  ]);

  // ── staff attendance (last 30 days) ──────────────────────
  console.log('\nStaff attendance…');
  // CLAUDE.md: Absent was removed as a status — only these three remain settable.
  const ATTENDANCE_STATUSES = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'HALF_DAY', 'LEAVE'];
  let attendanceCount = 0;
  for (const member of allStaff) {
    // An inactive (former) staff member only has attendance up to ~2 months
    // ago, when they were still around — not right up to today.
    const daysBack = member.isActive ? 30 : rand(45, 75);
    const startOffset = member.isActive ? 0 : rand(15, 30);
    for (let d = daysBack; d >= startOffset; d--) {
      // Skip Sundays (weekly off) — mirrors a typical retail shop schedule.
      const date = new Date(nowTs - d * DAY);
      if (date.getDay() === 0) continue;
      const status = pick(ATTENDANCE_STATUSES);
      const dateStr = date.toISOString().slice(0, 10);
      const checkIn = status === 'LEAVE' ? '' : `${String(rand(9, 10)).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}`;
      const checkOut = status === 'LEAVE' ? '' : status === 'HALF_DAY'
        ? `${String(rand(13, 14)).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}`
        : `${String(rand(19, 21)).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}`;
      await Attendance.create({
        userId: member._id, date: dateStr, status, checkIn, checkOut,
        note: status === 'LEAVE' ? pick(['Sick leave', 'Personal work', 'Family function', '']) : '',
        markedBy: admin._id, createdAt: date, updatedAt: date,
      });
      attendanceCount++;
    }
  }
  console.log(`  ${attendanceCount} attendance records across ${allStaff.length} staff`);

  // ── staff salary payments ────────────────────────────────
  console.log('\nSalary payments…');
  let salaryCount = 0;
  for (const member of allStaff) {
    // One SALARY payout per month the staff member has been active for
    // (capped to the last 4 months so the seed stays fast), each a few days
    // into the following month like a real payroll run.
    const monthsBack = member.isActive ? 4 : 2;
    for (let m = monthsBack; m >= 1; m--) {
      const payDate = new Date(nowTs); payDate.setDate(1); payDate.setMonth(payDate.getMonth() - m + 1, rand(1, 5));
      if (payDate.getTime() > nowTs) continue;
      const periodDate = new Date(payDate); periodDate.setMonth(periodDate.getMonth() - 1);
      const periodLabel = periodDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      await SalaryPayment.create({
        userId: member._id, amount: member.monthlySalary, periodLabel,
        method: pick(['BANK_TRANSFER', 'BANK_TRANSFER', 'CASH', 'UPI']), type: 'SALARY',
        note: `Salary for ${periodLabel}`, paidBy: admin._id, createdAt: payDate, updatedAt: payDate,
      });
      salaryCount++;
    }
    // A one-off advance or bonus for a couple of staff, for variety.
    if (chance(0.4)) {
      const extraDate = new Date(nowTs - rand(5, 25) * DAY);
      const isBonus = chance(0.5);
      await SalaryPayment.create({
        userId: member._id, amount: isBonus ? rand(500, 2000) : rand(1000, 3000),
        periodLabel: '', method: pick(['CASH', 'UPI']), type: isBonus ? 'BONUS' : 'ADVANCE',
        note: isBonus ? 'Festive bonus' : 'Salary advance requested', paidBy: admin._id,
        createdAt: extraDate, updatedAt: extraDate,
      });
      salaryCount++;
    }
  }
  console.log(`  ${salaryCount} salary/advance/bonus payments`);

  // ── purchase returns ──────────────────────────────────────
  // Goes through the real createPurchaseReturn controller — it decrements
  // stock and adjusts the supplier balance itself.
  console.log('\nPurchase returns…');
  let purchaseReturnCount = 0;
  {
    const candidates = allPurchases.slice(0, 3);
    for (const purchase of candidates) {
      const item = purchase.items[0];
      const fresh = await Product.findById(item.productId);
      if (!fresh || fresh.quantity < 1) continue;
      try {
        await callController(createPurchaseReturn, {
          user: admin,
          body: {
            purchaseId: purchase._id,
            items: [{ productId: fresh._id, qty: 1, costPrice: fresh.costPrice }],
            reason: pick(['Damaged on arrival', 'Wrong size shipped', 'Quality defect']),
            note: 'Seed data — sent back to supplier',
          },
        });
        purchaseReturnCount++;
      } catch { /* stock may have moved — skip */ }
    }
  }
  console.log(`  ${purchaseReturnCount} purchase returns`);

  // ── return / exchange / replace sessions ─────────────────
  // Goes through the real processReturnSession controller (see the
  // require() comment near the top) so CreditNote/ReplacementNote/Settlement
  // math, stock movements and points reversal are all correct by construction.
  console.log('\nReturn / Exchange / Replace sessions…');
  let returnSessionCount = 0;
  {
    // A handful of completed, non-custom-only sales to act on — oldest first
    // so the "days since sale" on each looks realistic for a return.
    const candidates = allSales
      .filter((s) => s.status === 'COMPLETED' && s.items.some((it) => !it.custom))
      .slice(0, 6);
    const SESSION_KINDS = ['RETURN', 'EXCHANGE', 'REPLACE'];
    for (let i = 0; i < candidates.length; i++) {
      const sale = candidates[i];
      const line = sale.items.find((it) => !it.custom);
      if (!line || line.noExchange || line.isDiscounted) continue; // mirrors the app's own eligibility rule
      const kind = SESSION_KINDS[i % SESSION_KINDS.length];
      const actor = chance(0.5) ? staff : admin;
      try {
        await callController(processReturnSession, {
          user: actor,
          body: {
            saleId: sale._id,
            actions: [{
              lineKey: line.lineId || String(line.productId), action: kind, qty: 1,
              reason: pick(['Customer changed mind', 'Wrong size', 'Defective item', 'Not as described']),
            }],
            settlement: kind === 'REPLACE' ? undefined : { method: pick(['CASH', 'CARD', 'STORE_CREDIT']) },
            note: 'Seed data',
          },
        });
        returnSessionCount++;
      } catch { /* line may have shifted since candidates was built — skip */ }
    }
  }
  console.log(`  ${returnSessionCount} return/exchange/replace sessions`);

  // ── summary ───────────────────────────────────────────────
  const [pTotal, pWeb, pAging, pAged, pPromo] = await Promise.all([
    Product.countDocuments({}), Product.countDocuments({ isWebVisible: true }),
    Product.countDocuments({ agingEnabled: true }), Product.countDocuments({ isAged: true }),
    Product.countDocuments({ isAged: false, discountPrice: { $ne: null } }),
  ]);
  console.log('\n' + '='.repeat(58));
  console.log('  TOM & JERRY KIDS WEAR — SEED COMPLETE');
  console.log('='.repeat(58));
  console.log('  Admin:    admin@commoncart.com / Admin@123');
  console.log('  Staff:    staff@commoncart.com / Staff@123   (+3 more staff, same password, 1 inactive)');
  console.log('  Customer: any of the 10 emails / Customer@123');
  console.log('  Coupons:  FIRSTSTEP · BABY100 · BUNDLE20 · WINTER10  (DIWALI25 expired)');
  console.log('  ─────────────────────────────────────────────────────');
  console.log(`  Product lines:     ${PRODUCT_LINES.length}   (${CATEGORY_CATALOG.length} age-band categories)`);
  console.log(`  Unit-products:     ${pTotal}  (all with a sample photo, ${pWeb} web-visible)`);
  console.log(`  Aging enabled:     ${pAging}   ·  auto-aged: ${pAged}   ·  manual promo: ${pPromo}`);
  console.log(`  Purchases:         ${purchaseCount}  (backdated 8–800 days for aging buckets)`);
  console.log(`  Suppliers:         ${suppliers.length}   ·  Customers: ${customers.length}`);
  console.log(`  POS sales:         ${saleCount}   ·  Web orders: ${orderCount}`);
  console.log(`  Staff:             ${allStaff.length}   ·  Attendance: ${attendanceCount}   ·  Salary/advance/bonus: ${salaryCount}`);
  console.log(`  Purchase returns:  ${purchaseReturnCount}   ·  Return/Exchange/Replace sessions: ${returnSessionCount}`);
  console.log('='.repeat(58));

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch((err) => { console.error(err); process.exit(1); });
