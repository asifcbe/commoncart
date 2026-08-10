/**
 * Seed script — populates the database with realistic dummy data for testing.
 * Run: node seed.js
 * Safe to re-run: clears existing data first (except admin account if already exists).
 */

require('dotenv').config();
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

// ── Helpers ──────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const id = () => uuidv4().slice(0, 6).toUpperCase();

function barcode7() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

function sku(category, name) {
  const prefix = (category.slice(0, 3) + name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${prefix}-${String(rand(10000, 99999))}`;
}

// ── Data definitions ─────────────────────────────────────────
const CATEGORIES = ['Clothing', 'Footwear', 'Accessories', 'Electronics', 'Home & Kitchen'];

const PRODUCT_DEFS = [
  // Clothing
  { name: 'Cotton T-Shirt', category: 'Clothing', costPrice: 250, price: 499, variants: [['Red','S'],['Red','M'],['Red','L'],['Blue','S'],['Blue','M'],['Blue','L'],['White','M'],['White','L']] },
  { name: 'Denim Jeans', category: 'Clothing', costPrice: 800, price: 1499, variants: [['Dark Blue','30'],['Dark Blue','32'],['Dark Blue','34'],['Black','30'],['Black','32'],['Black','34']] },
  { name: 'Polo Shirt', category: 'Clothing', costPrice: 350, price: 699, variants: [['Navy','S'],['Navy','M'],['Navy','L'],['Olive','M'],['Olive','L'],['Olive','XL']] },
  { name: 'Formal Shirt', category: 'Clothing', costPrice: 450, price: 899, variants: [['White','38'],['White','40'],['Blue','38'],['Blue','40'],['Blue','42']] },
  { name: 'Cargo Pants', category: 'Clothing', costPrice: 600, price: 1199, variants: [['Khaki','30'],['Khaki','32'],['Khaki','34'],['Olive','32'],['Olive','34']] },
  // Footwear
  { name: 'Running Shoes', category: 'Footwear', costPrice: 1200, price: 2499, variants: [['Black','7'],['Black','8'],['Black','9'],['White','8'],['White','9'],['White','10']] },
  { name: 'Casual Sneakers', category: 'Footwear', costPrice: 900, price: 1899, variants: [['White','7'],['White','8'],['White','9'],['Grey','8'],['Grey','9']] },
  { name: 'Leather Loafers', category: 'Footwear', costPrice: 1500, price: 2999, variants: [['Brown','8'],['Brown','9'],['Brown','10'],['Black','8'],['Black','9']] },
  // Accessories
  { name: 'Canvas Belt', category: 'Accessories', costPrice: 120, price: 249, variants: [['Black','M'],['Black','L'],['Brown','M'],['Brown','L']] },
  { name: 'Leather Wallet', category: 'Accessories', costPrice: 300, price: 599, variants: [['Black','One Size'],['Brown','One Size'],['Tan','One Size']] },
  { name: 'Sunglasses', category: 'Accessories', costPrice: 400, price: 799, variants: [['Black','One Size'],['Tortoise','One Size'],['Blue','One Size']] },
  // Electronics
  { name: 'USB-C Cable', category: 'Electronics', costPrice: 80, price: 199, variants: [['Black','1m'],['Black','2m'],['White','1m'],['White','2m']] },
  { name: 'Wireless Earbuds', category: 'Electronics', costPrice: 1200, price: 2499, variants: [['Black','One Size'],['White','One Size']] },
  { name: 'Phone Case 6.1"', category: 'Electronics', costPrice: 150, price: 349, variants: [['Clear','One Size'],['Black','One Size'],['Navy','One Size'],['Red','One Size']] },
  // Home & Kitchen
  { name: 'Stainless Steel Bottle', category: 'Home & Kitchen', costPrice: 250, price: 499, variants: [['Black','500ml'],['Silver','500ml'],['Black','1L'],['Silver','1L']] },
  { name: 'Cotton Tote Bag', category: 'Home & Kitchen', costPrice: 100, price: 199, variants: [['Natural','One Size'],['Black','One Size'],['Blue','One Size']] },
];

const SUPPLIER_DEFS = [
  { name: 'Mumbai Textile Mills', contactPerson: 'Rajesh Sharma', phone: '9821034567', email: 'rajesh@mumbaitextile.com', gstin: '27AABCU9603R1ZX', address: '42, Cotton Street, Mumbai - 400001' },
  { name: 'Delhi Footwear House', contactPerson: 'Priya Kapoor', phone: '9811234567', email: 'priya@delhifootwear.com', gstin: '07AAJCK2197H1Z9', address: '18, Leather Lane, Karol Bagh, New Delhi - 110005' },
  { name: 'TechGadgets India', contactPerson: 'Amit Verma', phone: '9900112233', email: 'amit@techgadgets.in', gstin: '29AABCT5432R1ZV', address: '7, Electronics Complex, Bengaluru - 560001' },
  { name: 'Chennai Accessories Co.', contactPerson: 'Sundar Rajan', phone: '9444012345', email: 'sundar@chennaiacc.com', gstin: '33AACCC1329A1ZT', address: '55, Anna Salai, Chennai - 600002' },
  { name: 'Home Essentials Ltd.', contactPerson: 'Meera Nair', phone: '9567890123', email: 'meera@homeessentials.co.in', gstin: '32AABCH9231R1ZM', address: '22, Industrial Estate, Kochi - 682021' },
];

const CUSTOMER_DEFS = [
  { name: 'Arjun Mehta', email: 'arjun.mehta@gmail.com', phone: '9876543210' },
  { name: 'Sneha Reddy', email: 'sneha.reddy@gmail.com', phone: '9765432109' },
  { name: 'Kiran Patel', email: 'kiran.patel@yahoo.com', phone: '9654321098' },
  { name: 'Divya Singh', email: 'divya.singh@outlook.com', phone: '9543210987' },
  { name: 'Rohan Joshi', email: 'rohan.joshi@gmail.com', phone: '9432109876' },
  { name: 'Ananya Iyer', email: 'ananya.iyer@gmail.com', phone: '9321098765' },
  { name: 'Vikram Nair', email: 'vikram.nair@gmail.com', phone: '9210987654' },
  { name: 'Pooja Sharma', email: 'pooja.sharma@hotmail.com', phone: '9109876543' },
];

async function seed() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  // ── Clear existing data ─────────────────────────────────────
  console.log('Clearing existing data…');
  await Promise.all([
    Product.deleteMany({}),
    Supplier.deleteMany({}),
    Purchase.deleteMany({}),
    SaleTransaction.deleteMany({}),
    StockMovement.deleteMany({}),
    Customer.deleteMany({}),
    Order.deleteMany({}),
    Coupon.deleteMany({}),
    AppSettings.deleteMany({}),
    // Keep Users — we'll upsert
  ]);
  console.log('Cleared.\n');

  // ── Users (upsert + always reset password so logins are predictable) ──
  console.log('Creating users…');
  const pwHash = await bcrypt.hash('Admin@123', 12);
  const staffHash = await bcrypt.hash('Staff@123', 12);

  let admin = await User.findOneAndUpdate(
    { email: 'admin@commoncart.com' },
    { name: 'Admin User', passwordHash: pwHash, role: 'ADMIN' },
    { new: true, upsert: true }
  );
  let staff = await User.findOneAndUpdate(
    { email: 'staff@commoncart.com' },
    { name: 'Staff Member', passwordHash: staffHash, role: 'STAFF' },
    { new: true, upsert: true }
  );
  console.log('  admin@commoncart.com  / Admin@123  (ADMIN)');
  console.log('  staff@commoncart.com  / Staff@123  (STAFF)');

  // ── App Settings ────────────────────────────────────────────
  console.log('\nCreating app settings…');
  await AppSettings.set('CREDIT_CONFIG', { rupeesPerPoint: 500, pointValue: 1 });
  await AppSettings.set('PRICE_AGING_CONFIG', {
    enabled: true,
    steps: [
      { days: 30,  label: 'Fresh (30 days)',           percent: 0  },
      { days: 60,  label: 'Slow-moving (60 days)',      percent: 5  },
      { days: 90,  label: 'Clearance (90 days)',        percent: 10 },
      { days: 120, label: 'Heavy Discount (120 days)',  percent: 15 },
      { days: 180, label: 'Half-Year Sale (180 days)',  percent: 20 },
      { days: 365, label: 'Annual Clearance (1 Year)',  percent: 30 },
      { days: 730, label: 'Deep Clearance (2+ Years)',  percent: 50 },
    ],
  });

  // ── Suppliers ───────────────────────────────────────────────
  console.log('\nCreating suppliers…');
  const suppliers = await Supplier.insertMany(SUPPLIER_DEFS.map((s) => ({ ...s, balance: 0, isActive: true })));
  console.log(`  ${suppliers.length} suppliers created`);

  // ── Products + Purchases ────────────────────────────────────
  console.log('\nCreating products and purchases…');
  const allProducts = [];
  const allPurchases = [];

  // Group product defs by supplier
  const supplierForCategory = {
    'Clothing': suppliers[0],
    'Footwear': suppliers[1],
    'Electronics': suppliers[2],
    'Accessories': suppliers[3],
    'Home & Kitchen': suppliers[4],
  };

  for (const def of PRODUCT_DEFS) {
    const supplier = supplierForCategory[def.category];
    const purchaseItems = [];

    for (const [color, size] of def.variants) {
      const qty = rand(5, 25);
      const bcode = barcode7();
      const skuVal = sku(def.category, def.name);
      const product = await Product.create({
        name: def.name,
        category: def.category,
        description: `High quality ${def.name.toLowerCase()} — comfortable and durable.`,
        SKU: skuVal,
        barcode: bcode,
        price: def.price,
        costPrice: def.costPrice,
        quantity: qty,
        reservedQty: 0,
        supplier: supplier.name,
        lowStockThreshold: 3,
        isActive: true,
        isWebVisible: true,
        color,
        size,
      });
      allProducts.push(product);
      purchaseItems.push({ productId: product._id, name: product.name, category: product.category, qty, costPrice: def.costPrice, price: def.price, color, size });
    }

    const totalCost = purchaseItems.reduce((s, i) => s + i.qty * i.costPrice, 0);
    const purchaseId = `PUR-${Date.now()}-${id()}`;
    const purchase = await Purchase.create({
      purchaseId,
      supplierId: supplier._id,
      supplier: supplier.name,
      purchaseDate: new Date(Date.now() - rand(1, 60) * 86400000),
      items: purchaseItems,
      totalCost,
      note: `Initial stock purchase for ${def.name}`,
      purchasedBy: admin._id,
    });
    allPurchases.push(purchase);

    // Update supplier balance
    await Supplier.findByIdAndUpdate(supplier._id, { $inc: { balance: totalCost } });

    // Add stock movements
    for (const item of purchaseItems) {
      await StockMovement.create({
        productId: item.productId,
        type: 'RESTOCK',
        channel: 'SYSTEM',
        quantityChanged: item.qty,
        previousQty: 0,
        newQty: item.qty,
        note: `Purchase ${purchaseId}`,
        performedBy: admin._id,
        transactionId: purchaseId,
      });
    }

    process.stdout.write('.');
  }
  console.log(`\n  ${allProducts.length} products, ${allPurchases.length} purchases`);

  // ── Backdate some products into aging buckets (for clearance testing) ──
  // Aging keys off product.createdAt — spread a portion across age ranges.
  console.log('\nBackdating some products into aging buckets…');
  const ageBuckets = [10, 45, 75, 100, 150, 250, 400, 800]; // days old
  let aged = 0;
  for (const product of allProducts) {
    // ~45% of products get an older createdAt so the Aged Products / Clearance pages have data
    if (Math.random() < 0.45) {
      const daysOld = pick(ageBuckets);
      const createdAt = new Date(Date.now() - daysOld * 86400000);
      // Bypass Mongoose timestamps plugin with a raw collection update
      await Product.collection.updateOne({ _id: product._id }, { $set: { createdAt } });
      aged++;
    }
  }
  console.log(`  ${aged} products backdated`);

  // Apply aging discounts now so Clearance / aged-item flows are testable immediately.
  // Aging-discounted products are marked isAged:true → NOT exchangeable.
  console.log('\nApplying aging discounts (isAged = true)…');
  const agingCfg = await AppSettings.get('PRICE_AGING_CONFIG');
  const sortedSteps = [...agingCfg.steps].sort((a, b) => b.days - a.days);
  const nowTs = new Date();
  let discounted = 0;
  const freshProducts = await Product.find({ isActive: true, isWebVisible: true });
  for (const p of freshProducts) {
    const ageDays = (nowTs - new Date(p.createdAt)) / 86400000;
    const step = sortedSteps.find((s) => ageDays >= s.days && s.percent > 0);
    if (!step) continue;
    const base = p.price;
    const discountedPrice = Math.max(p.costPrice || 0, base * (1 - step.percent / 100));
    const rounded = Math.round(discountedPrice * 100) / 100;
    if (rounded < base) {
      await Product.findByIdAndUpdate(p._id, { discountPrice: rounded, isAged: true });
      discounted++;
    }
  }
  console.log(`  ${discounted} aged products on clearance (not exchangeable)`);

  // Give a handful of FRESH products a manual promotional discount (isAged stays false).
  // These should display a discounted price but REMAIN exchangeable.
  console.log('\nApplying manual promo discounts (isAged = false, still exchangeable)…');
  const manualPool = await Product.find({ isAged: false, discountPrice: null, isActive: true }).limit(40);
  let manualDiscounted = 0;
  for (const p of manualPool) {
    if (Math.random() < 0.2 && manualDiscounted < 6) {
      const promo = Math.max(p.costPrice || 0, Math.round(p.price * 0.9 * 100) / 100); // 10% off
      if (promo < p.price) {
        await Product.findByIdAndUpdate(p._id, { discountPrice: promo }); // isAged untouched (false)
        manualDiscounted++;
      }
    }
  }
  console.log(`  ${manualDiscounted} products with manual promo price (exchangeable)`);

  // Add some payments to suppliers
  for (const sup of suppliers) {
    const totalOwed = (await Supplier.findById(sup._id)).balance;
    const paid = Math.floor(totalOwed * 0.6);
    if (paid > 0) {
      await Supplier.findByIdAndUpdate(sup._id, {
        $inc: { balance: -paid },
        $push: {
          payments: {
            amount: paid,
            method: pick(['CASH', 'BANK_TRANSFER', 'UPI']),
            reference: `REF-${id()}`,
            note: 'Partial payment',
            recordedBy: admin._id,
            createdAt: new Date(Date.now() - rand(1, 10) * 86400000),
            updatedAt: new Date(),
          },
        },
      });
    }
  }

  // ── Customers ───────────────────────────────────────────────
  console.log('\nCreating customers…');
  const custPwHash = await bcrypt.hash('Customer@123', 10);
  const customers = await Customer.insertMany(
    CUSTOMER_DEFS.map((c) => ({
      ...c,
      passwordHash: custPwHash,
      creditPoints: rand(0, 200),
      isActive: true,
      addresses: [{
        fullName: c.name,
        phone: c.phone,
        line1: `${rand(1, 999)}, Main Street`,
        city: pick(['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune']),
        state: pick(['Maharashtra', 'Karnataka', 'Tamil Nadu', 'Telangana']),
        zip: String(rand(400001, 600099)),
        country: 'IN',
        isDefault: true,
      }],
    }))
  );
  console.log(`  ${customers.length} customers created (password: Customer@123)`);

  // ── POS Sale Transactions (STORE) ───────────────────────────
  console.log('\nCreating POS sale transactions…');
  const payMethods = ['CASH', 'CARD', 'MOBILE', 'OTHER'];
  let saleCount = 0;

  for (let d = 14; d >= 0; d--) {
    const salesThisDay = rand(3, 8);
    for (let s = 0; s < salesThisDay; s++) {
      const numItems = rand(1, 4);
      const chosenProducts = [];
      const used = new Set();
      for (let i = 0; i < numItems; i++) {
        let p;
        let tries = 0;
        do { p = pick(allProducts); tries++; } while ((used.has(p._id.toString()) || p.quantity < 1) && tries < 20);
        if (tries < 20) { used.add(p._id.toString()); chosenProducts.push(p); }
      }
      if (!chosenProducts.length) continue;

      const items = chosenProducts.map((p) => ({
        productId: p._id,
        barcode: p.barcode,
        name: `${p.name} (${p.color}/${p.size})`,
        qty: 1,
        price: p.discountPrice ?? p.price,
        isDiscounted: p.discountPrice != null,
      }));
      const totalAmount = items.reduce((s, i) => s + i.price * i.qty, 0);
      const txnId = `TXN-${Date.now()}-${id()}`;
      const customer = Math.random() > 0.5 ? pick(customers) : null;

      const txnDate = new Date();
      txnDate.setDate(txnDate.getDate() - d);
      txnDate.setHours(rand(9, 20), rand(0, 59));

      await SaleTransaction.create({
        transactionId: txnId,
        channel: 'STORE',
        items,
        totalAmount,
        paymentMethod: pick(payMethods),
        status: 'COMPLETED',
        soldBy: Math.random() > 0.3 ? admin._id : staff._id,
        customerId: customer?._id || null,
        customerPhone: customer?.phone || '',
        couponCode: '',
        discountAmount: 0,
        creditPointsEarned: Math.floor(totalAmount / 500),
        creditPointsRedeemed: 0,
        note: '',
        createdAt: txnDate,
        updatedAt: txnDate,
      });

      // Deduct stock + movement
      for (const item of items) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.qty } });
        await StockMovement.create({
          productId: item.productId,
          type: 'SALE',
          channel: 'STORE',
          quantityChanged: -item.qty,
          previousQty: 0, // approximate
          newQty: 0,
          note: `POS Sale ${txnId}`,
          performedBy: admin._id,
          transactionId: txnId,
          createdAt: txnDate,
        });
      }
      saleCount++;
    }
  }
  console.log(`  ${saleCount} store sales created`);

  // ── Web Orders ──────────────────────────────────────────────
  console.log('\nCreating web orders…');
  const fulfillmentStatuses = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'SHIPPED', 'PROCESSING', 'PENDING', 'CANCELLED'];
  let orderCount = 0;

  for (let d = 14; d >= 0; d--) {
    const ordersThisDay = rand(1, 4);
    for (let o = 0; o < ordersThisDay; o++) {
      const customer = pick(customers);
      const numItems = rand(1, 3);
      const chosen = [];
      const used = new Set();
      for (let i = 0; i < numItems; i++) {
        let p;
        let tries = 0;
        do { p = pick(allProducts); tries++; } while ((used.has(p._id.toString()) || p.quantity < 1) && tries < 20);
        if (tries < 20) { used.add(p._id.toString()); chosen.push(p); }
      }
      if (!chosen.length) continue;

      const items = chosen.map((p) => ({ productId: p._id, name: `${p.name} (${p.color}/${p.size})`, barcode: p.barcode, price: p.price, qty: 1, image: '' }));
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const shippingCost = subtotal > 999 ? 0 : 99;
      const totalAmount = subtotal + shippingCost;
      const fulfillmentStatus = pick(fulfillmentStatuses);
      const paymentStatus = ['DELIVERED', 'SHIPPED', 'PROCESSING'].includes(fulfillmentStatus) ? 'PAID' : fulfillmentStatus === 'CANCELLED' ? 'REFUNDED' : 'PENDING';
      const orderId = `ORD-${Date.now()}-${id()}`;

      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - d);
      orderDate.setHours(rand(8, 22), rand(0, 59));

      await Order.create({
        orderId,
        customerId: customer._id,
        channel: 'WEB',
        items,
        shippingAddress: customer.addresses[0],
        subtotal,
        shippingCost,
        totalAmount,
        paymentMethod: pick(['COD', 'ONLINE', 'CARD']),
        paymentStatus,
        fulfillmentStatus,
        stockReserved: false,
        stockDeducted: paymentStatus === 'PAID',
        note: '',
        couponCode: '',
        discountAmount: 0,
        creditPointsEarned: paymentStatus === 'PAID' ? Math.floor(totalAmount / 500) : 0,
        createdAt: orderDate,
        updatedAt: orderDate,
      });
      orderCount++;
    }
  }
  console.log(`  ${orderCount} web orders created`);

  // ── Coupons ─────────────────────────────────────────────────
  console.log('\nCreating coupons…');
  await Coupon.insertMany([
    { code: 'WELCOME10', description: '10% off your order', type: 'PERCENTAGE', value: 10, minOrderAmount: 500, maxDiscountAmount: 200, maxUses: 100, usedCount: 12, isActive: true, createdBy: admin._id, expiresAt: new Date(Date.now() + 30 * 86400000) },
    { code: 'FLAT100', description: 'Flat ₹100 off', type: 'FIXED_AMOUNT', value: 100, minOrderAmount: 999, maxDiscountAmount: 0, maxUses: 50, usedCount: 8, isActive: true, createdBy: admin._id, expiresAt: new Date(Date.now() + 60 * 86400000) },
    { code: 'SAVE20', description: '20% off on orders above ₹2000', type: 'PERCENTAGE', value: 20, minOrderAmount: 2000, maxDiscountAmount: 500, maxUses: 30, usedCount: 3, isActive: true, createdBy: admin._id, expiresAt: new Date(Date.now() + 90 * 86400000) },
    { code: 'SUMMER15', description: 'Summer sale 15% off', type: 'PERCENTAGE', value: 15, minOrderAmount: 800, maxDiscountAmount: 300, maxUses: 200, usedCount: 45, isActive: true, createdBy: admin._id, expiresAt: new Date(Date.now() + 45 * 86400000) },
    { code: 'EXPIRED50', description: 'Expired flat ₹50 off', type: 'FIXED_AMOUNT', value: 50, minOrderAmount: 300, maxDiscountAmount: 0, maxUses: 10, usedCount: 10, isActive: false, createdBy: admin._id, expiresAt: new Date(Date.now() - 5 * 86400000) },
  ]);
  console.log('  5 coupons created');

  // ── Summary ─────────────────────────────────────────────────
  console.log('\n' + '='.repeat(55));
  console.log('SEED COMPLETE');
  console.log('='.repeat(55));
  console.log('\nLogin credentials:');
  console.log('  Admin:    admin@commoncart.com  /  Admin@123');
  console.log('  Staff:    staff@commoncart.com  /  Staff@123');
  console.log('  Customer: (any email above)     /  Customer@123');
  console.log('\nCoupon codes: WELCOME10 · FLAT100 · SAVE20 · SUMMER15');
  console.log('\nData summary:');
  console.log(`  Users:      2 (admin + staff)`);
  console.log(`  Suppliers:  ${suppliers.length}`);
  console.log(`  Products:   ${allProducts.length} variants (${discounted} on clearance discount)`);
  console.log(`  Purchases:  ${allPurchases.length}`);
  console.log(`  Customers:  ${customers.length}`);
  console.log(`  POS Sales:  ${saleCount}`);
  console.log(`  Web Orders: ${orderCount}`);
  console.log(`  Coupons:    5`);
  console.log('='.repeat(55));

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch((err) => { console.error(err); process.exit(1); });
