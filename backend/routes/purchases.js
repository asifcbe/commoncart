const express = require('express');
const router = express.Router();
const { createPurchase, listPurchases, getPurchase, updatePurchase, deletePurchase, findPurchaseByBarcode, getUnitByBarcode, deleteUnits } = require('../controllers/purchaseController');
const { protect, manageOnly } = require('../middleware/auth');

router.get('/find-by-barcode', protect, findPurchaseByBarcode);
router.get('/unit-by-barcode', protect, getUnitByBarcode);
router.post('/delete-units', protect, manageOnly, deleteUnits);
router.get('/', protect, listPurchases);
router.post('/', protect, manageOnly, createPurchase);
router.get('/:id', protect, getPurchase);
router.put('/:id', protect, manageOnly, updatePurchase);
router.delete('/:id', protect, manageOnly, deletePurchase);

module.exports = router;
