const express = require('express');
const router = express.Router();
const { listCoupons, createCoupon, updateCoupon, deleteCoupon, validateCoupon } = require('../controllers/couponController');
const { protect, adminOnly } = require('../middleware/auth');
const { protectCustomer } = require('../middleware/customerAuth');

// Public validation (used by website checkout & POS)
router.get('/validate', validateCoupon);

// Admin CRUD
router.get('/', protect, listCoupons);
router.post('/', protect, adminOnly, createCoupon);
router.put('/:id', protect, adminOnly, updateCoupon);
router.delete('/:id', protect, adminOnly, deleteCoupon);

module.exports = router;
