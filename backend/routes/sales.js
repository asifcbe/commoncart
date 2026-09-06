const express = require('express');
const router = express.Router();
const { processStoreSale, listSales, getSale, getDashboardStats, updateSale, voidSale, findByNumber, findByItemBarcode } = require('../controllers/salesController');
const { protect, adminOnly, manageOnly } = require('../middleware/auth');

router.get('/dashboard-stats', protect, getDashboardStats);
router.post('/store', protect, processStoreSale);
router.get('/', protect, listSales);
// Bill-number and item-barcode lookups must precede the generic /:id route
router.get('/by-number/:number', protect, findByNumber);
router.get('/by-item-barcode/:barcode', protect, findByItemBarcode);
router.get('/:id', protect, getSale);
router.put('/:id', protect, manageOnly, updateSale);
// Void (not hard-delete) a bill — admin only, reverses stock/points/coupon.
router.post('/:id/void', protect, adminOnly, voidSale);

module.exports = router;
