const express = require('express');
const router = express.Router();
const {
  register, login, getMe, updateProfile, addAddress, removeAddress,
  adminListCustomers, lookupByPhone, createPOSCustomer, adminAdjustPoints,
  adminCreateCustomer, adminUpdateCustomer,
} = require('../controllers/customerController');
const { protectCustomer } = require('../middleware/customerAuth');
const { protect, adminOnly } = require('../middleware/auth');

// Web customer auth
router.post('/register', register);
router.post('/login', login);
router.get('/me', protectCustomer, getMe);
router.put('/me', protectCustomer, updateProfile);
router.post('/me/addresses', protectCustomer, addAddress);
router.delete('/me/addresses/:addressId', protectCustomer, removeAddress);

// Admin routes
router.get('/admin', protect, adminListCustomers);
router.get('/admin/lookup/:phone', protect, lookupByPhone);
router.post('/admin/pos', protect, createPOSCustomer);
router.post('/admin', protect, adminOnly, adminCreateCustomer);
router.put('/admin/:id/points', protect, adminOnly, adminAdjustPoints);
router.put('/admin/:id', protect, adminOnly, adminUpdateCustomer);

module.exports = router;
