const express = require('express');
const router = express.Router();
const { listSaleReturns, listExchanges } = require('../controllers/saleReturnController'); // legacy, read-only
const {
  processReturnSession,
  listCreditNotes, getCreditNote,
  listReplacementNotes, getReplacementNote,
} = require('../controllers/returnSessionController');
const { protect, manageOnly } = require('../middleware/auth');

// Unified return/exchange/replace flow — creates Credit Notes, linked new Tax
// Invoices, and Replacement Notes without ever modifying the original invoice.
router.post('/sessions', protect, manageOnly, processReturnSession);
router.get('/credit-notes', protect, listCreditNotes);
router.get('/credit-notes/:id', protect, getCreditNote);
router.get('/replacement-notes', protect, listReplacementNotes);
router.get('/replacement-notes/:id', protect, getReplacementNote);

// Legacy — read-only historical records from before this redesign.
router.get('/legacy/returns', protect, listSaleReturns);
router.get('/legacy/exchanges', protect, listExchanges);

module.exports = router;
