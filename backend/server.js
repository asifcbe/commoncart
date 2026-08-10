require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const barcodeRoutes = require('./routes/barcode');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const purchaseRoutes = require('./routes/purchases');
const couponRoutes = require('./routes/coupons');
const settingsRoutes = require('./routes/settings');
const supplierRoutes = require('./routes/suppliers');
const saleReturnRoutes = require('./routes/saleReturns');
const purchaseReturnRoutes = require('./routes/purchaseReturns');
const staffRoutes = require('./routes/staff');
const reportsRoutes = require('./routes/reports');

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URLS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim());

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
// Default 100kb body limit is too small for bulk purchase entries (100s–1000s of items).
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io to every request
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// Admin / Staff API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/users', userRoutes);

// Phase 2 — Customer & E-Commerce API
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sale-returns', saleReturnRoutes);
app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportsRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', phase: 2 }));

// Socket.IO — real-time sync hub
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Client can join room to get product-specific updates
  socket.on('join:product', (productId) => socket.join(`product:${productId}`));
  socket.on('leave:product', (productId) => socket.leave(`product:${productId}`));

  socket.on('disconnect', () => console.log(`[socket] disconnected: ${socket.id}`));
});

const { runAutoDeleteSweep } = require('./controllers/settingsController');

// Periodically reconcile out-of-stock timers and remove products that have
// been out of stock past the admin-configured threshold. Runs on boot and
// hourly thereafter (the timer granularity is days, so hourly is ample).
const AUTO_DELETE_INTERVAL_MS = 60 * 60 * 1000;
function scheduleAutoDeleteSweep() {
  const sweep = async () => {
    try {
      const { deleted } = await runAutoDeleteSweep(io);
      if (deleted) console.log(`[auto-delete] removed ${deleted} out-of-stock product(s)`);
    } catch (err) {
      console.error('[auto-delete] sweep failed:', err.message);
    }
  };
  sweep();
  setInterval(sweep, AUTO_DELETE_INTERVAL_MS);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[db] MongoDB connected');
    const PORT = process.env.PORT || 5001;
    server.listen(PORT, () => console.log(`[server] Running on port ${PORT}`));
    scheduleAutoDeleteSweep();
  })
  .catch((err) => {
    console.error('[db] Connection error:', err);
    process.exit(1);
  });
