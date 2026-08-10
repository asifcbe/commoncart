const express = require('express');
const router = express.Router();
const {
  createSupplier, listSuppliers, getSupplier,
  updateSupplier, addPayment, deletePayment, deleteSupplier,
} = require('../controllers/supplierController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, listSuppliers);
router.post('/', protect, adminOnly, createSupplier);
router.get('/:id', protect, getSupplier);
router.put('/:id', protect, adminOnly, updateSupplier);
router.delete('/:id', protect, adminOnly, deleteSupplier);
router.post('/:id/payments', protect, adminOnly, addPayment);
router.delete('/:id/payments/:paymentId', protect, adminOnly, deletePayment);

module.exports = router;
