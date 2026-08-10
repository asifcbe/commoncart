const express = require('express');
const router = express.Router();
const { processStoreSale, listSales, getSale, getDashboardStats, updateSale, findByNumber } = require('../controllers/salesController');
const { protect, manageOnly } = require('../middleware/auth');

router.get('/dashboard-stats', protect, getDashboardStats);
router.post('/store', protect, processStoreSale);
router.get('/', protect, listSales);
// Bill-number lookup must precede the generic /:id route
router.get('/by-number/:number', protect, findByNumber);
router.get('/:id', protect, getSale);
router.put('/:id', protect, manageOnly, updateSale);

module.exports = router;
