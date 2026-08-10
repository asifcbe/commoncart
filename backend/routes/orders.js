const express = require('express');
const router = express.Router();
const {
  placeOrder, confirmOrder, cancelOrder, updateFulfillment,
  myOrders, myOrderDetail, adminListOrders, adminGetOrder,
  updatePaymentStatus, publicProducts, publicProductDetail,
} = require('../controllers/orderController');
const { protectCustomer } = require('../middleware/customerAuth');
const { protect, adminOnly } = require('../middleware/auth');

// Public product browsing (no auth)
router.get('/products/public', publicProducts);
router.get('/products/public/:id', publicProductDetail);

// Customer order routes
router.post('/', protectCustomer, placeOrder);
router.get('/my', protectCustomer, myOrders);
router.get('/my/:id', protectCustomer, myOrderDetail);
router.put('/:id/cancel', protectCustomer, cancelOrder);

// Admin order routes
router.get('/admin', protect, adminOnly, adminListOrders);
router.get('/admin/:id', protect, adminOnly, adminGetOrder);
router.put('/:id/confirm', protect, adminOnly, confirmOrder);
router.put('/:id/fulfillment', protect, adminOnly, updateFulfillment);
router.put('/:id/payment-status', protect, adminOnly, updatePaymentStatus);
router.put('/:id/admin-cancel', protect, adminOnly, cancelOrder);

module.exports = router;
