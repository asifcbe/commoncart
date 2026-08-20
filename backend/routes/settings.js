const express = require('express');
const router = express.Router();
const {
  getCreditConfig, updateCreditConfig,
  getBusinessConfig, updateBusinessConfig,
  getCategoryConfig, updateCategoryConfig,
  getVariantConfig, updateVariantConfig,
  getPaymentModesConfig, updatePaymentModesConfig,
  getAutoDeleteConfig, updateAutoDeleteConfig, runAutoDeleteNow,
  getLabelPrintConfig, updateLabelPrintConfig,
  getBillPrintConfig, updateBillPrintConfig,
  getDisplayConfig, updateDisplayConfig,
  getAgingConfig, updateAgingConfig, applyAgingNow, getAgedProducts,
  getClearanceProducts,
  getBarcodeConfig, updateBarcodeConfig, reserveBarcodes,
  getInvoiceConfig, updateInvoiceConfig,
  getDocNumberingConfig, updateDocNumberingConfig,
} = require('../controllers/settingsController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/credit-config', protect, getCreditConfig);
router.put('/credit-config', protect, adminOnly, updateCreditConfig);

// Business / GST — readable by any logged-in user (POS needs it for bills), writable by admin
router.get('/business-config', protect, getBusinessConfig);
router.put('/business-config', protect, adminOnly, updateBusinessConfig);

// Category catalog — readable by any logged-in user (product form needs it), writable by admin
router.get('/category-config', protect, getCategoryConfig);
router.put('/category-config', protect, adminOnly, updateCategoryConfig);

// Variants & sizes master lists — readable by any logged-in user (forms need it), writable by admin
router.get('/variant-config', protect, getVariantConfig);
router.put('/variant-config', protect, adminOnly, updateVariantConfig);

// Payment modes offered at POS — readable by any logged-in user, writable by admin
router.get('/payment-modes-config', protect, getPaymentModesConfig);
router.put('/payment-modes-config', protect, adminOnly, updatePaymentModesConfig);

// Auto-delete out-of-stock products
router.get('/auto-delete-config', protect, getAutoDeleteConfig);
router.put('/auto-delete-config', protect, adminOnly, updateAutoDeleteConfig);
router.post('/auto-delete-run', protect, adminOnly, runAutoDeleteNow);

// Label printing — readable by any logged-in user (print dialogs need it), writable by admin
router.get('/label-print-config', protect, getLabelPrintConfig);
router.put('/label-print-config', protect, adminOnly, updateLabelPrintConfig);

// Bill / receipt print formatting — readable by any logged-in user, writable by admin
router.get('/bill-print-config', protect, getBillPrintConfig);
router.put('/bill-print-config', protect, adminOnly, updateBillPrintConfig);

// App-wide date display format — readable by any logged-in user, writable by admin
router.get('/display-config', protect, getDisplayConfig);
router.put('/display-config', protect, adminOnly, updateDisplayConfig);

router.get('/aging-config', protect, getAgingConfig);
router.put('/aging-config', protect, adminOnly, updateAgingConfig);
router.post('/aging-apply', protect, adminOnly, applyAgingNow);
router.get('/aged-products', protect, getAgedProducts);

// Barcode counter config — start number + sequential counter
router.get('/barcode-config', protect, getBarcodeConfig);
router.put('/barcode-config', protect, adminOnly, updateBarcodeConfig);
router.post('/reserve-barcodes', protect, reserveBarcodes);

// Invoice number format (legacy single-type endpoint — operates on the INV slot)
router.get('/invoice-config', protect, getInvoiceConfig);
router.put('/invoice-config', protect, adminOnly, updateInvoiceConfig);

// Document numbering — per-type (INV/PUR/CN/RN/ORD) format config
router.get('/doc-numbering-config', protect, getDocNumberingConfig);
router.put('/doc-numbering-config', protect, adminOnly, updateDocNumberingConfig);

// Public (storefront clearance page — no auth needed)
router.get('/clearance', getClearanceProducts);

module.exports = router;
