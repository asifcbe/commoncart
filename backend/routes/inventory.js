const express = require('express');
const router = express.Router();
const { restock, adjust, getMovements, getLowStock, getOverview, getOverviewFilters, getBreakdownBarcodes } = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');

router.post('/restock', protect, restock);
router.post('/adjust', protect, adjust);
router.get('/movements', protect, getMovements);
router.get('/low-stock', protect, getLowStock);
router.get('/overview', protect, getOverview);
router.get('/overview-filters', protect, getOverviewFilters);
router.get('/barcodes', protect, getBreakdownBarcodes);

module.exports = router;
