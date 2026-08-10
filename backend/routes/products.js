const express = require('express');
const router = express.Router();
const {
  listProducts, createProduct, getProduct,
  updateProduct, deleteProduct, getByBarcode, getCategories,
} = require('../controllers/productController');
const { protect, manageOnly } = require('../middleware/auth');
const upload = require('../utils/multerConfig');

router.get('/categories', protect, getCategories);
router.get('/barcode/:code', protect, getByBarcode);
router.get('/', protect, listProducts);
router.post('/', protect, manageOnly, upload.array('images', 5), createProduct);
router.get('/:id', protect, getProduct);
router.put('/:id', protect, manageOnly, upload.array('images', 5), updateProduct);
router.delete('/:id', protect, manageOnly, deleteProduct);

module.exports = router;
