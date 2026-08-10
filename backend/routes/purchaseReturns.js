const express = require('express');
const router = express.Router();
const { createPurchaseReturn, listPurchaseReturns } = require('../controllers/purchaseReturnController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, listPurchaseReturns);
router.post('/', protect, adminOnly, createPurchaseReturn);

module.exports = router;
