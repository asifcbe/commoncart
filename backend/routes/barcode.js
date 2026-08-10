const express = require('express');
const router = express.Router();
const { generateBarcodeImage, printBatch } = require('../controllers/barcodeController');
const { protect } = require('../middleware/auth');

router.get('/generate/:productId', protect, generateBarcodeImage);
router.post('/print-batch', protect, printBatch);

module.exports = router;
