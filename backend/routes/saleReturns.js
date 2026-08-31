const express = require('express');
const router = express.Router();
const { listSaleReturns, listExchanges } = require('../controllers/saleReturnController'); // legacy, read-only
const {
  processReturnSession,
  listCreditNotes, getCreditNote,
  listReplacementNotes, getReplacementNote,
} = require('../controllers/returnSessionController');
const { protect } = require('../middleware/auth');

// Unified return/exchange/replace flow — creates Credit Notes, linked new Tax
// Invoices, and Replacement Notes without ever modifying the original invoice.
// Any logged-in user who can reach the Sales screen may run this (same access
// level as POS checkout, `POST /sales/store`); it never edits the original
// invoice, so it isn't a `manage`-level destructive action.
router.post('/sessions', protect, processReturnSession);
router.get('/credit-notes', protect, listCreditNotes);
router.get('/credit-notes/:id', protect, getCreditNote);
router.get('/replacement-notes', protect, listReplacementNotes);
router.get('/replacement-notes/:id', protect, getReplacementNote);

// Legacy — read-only historical records from before this redesign.
router.get('/legacy/returns', protect, listSaleReturns);
router.get('/legacy/exchanges', protect, listExchanges);

module.exports = router;
