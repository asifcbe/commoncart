const express = require('express');
const router = express.Router();
const {
  listProducts, createProduct, getProduct,
  updateProduct, deleteProduct, getByBarcode, getCategories,
} = require('../controllers/productController');
const { protect, manageOnly } = require('../middleware/auth');
const upload = require('../utils/multerConfig');
const { compressUploadedImages } = require('../utils/imageCompress');

// Multer buffers each image in memory → compress step re-encodes to a
// ≤250KB WebP on disk and rewrites req.files → controller stores the paths.
const imgUpload = [upload.array('images', 5), compressUploadedImages];

router.get('/categories', protect, getCategories);
router.get('/barcode/:code', protect, getByBarcode);
router.get('/', protect, listProducts);
router.post('/', protect, manageOnly, ...imgUpload, createProduct);
router.get('/:id', protect, getProduct);
router.put('/:id', protect, manageOnly, ...imgUpload, updateProduct);
router.delete('/:id', protect, manageOnly, deleteProduct);

module.exports = router;
