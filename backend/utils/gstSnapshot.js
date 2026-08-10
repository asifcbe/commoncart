const AppSettings = require('../models/AppSettings');

const BUSINESS_KEY = 'BUSINESS_CONFIG';
const DEFAULT_BUSINESS = { gstEnabled: false, gstPercent: 18, gstInclusive: true, gstin: '', stateName: '' };

// Reads the shop-wide GST config and returns a plain snapshot object to be
// stored on a document (SaleTransaction/CreditNote) at creation time, so the
// document's tax basis never drifts if the shop's rate setting changes later.
// Always intra-state (CGST+SGST 50/50) — matches the frontend's computeGst()
// assumption; no per-product/HSN/IGST support.
async function getGstSnapshot() {
  const cfg = await AppSettings.get(BUSINESS_KEY, DEFAULT_BUSINESS);
  const enabled = !!cfg.gstEnabled && !!cfg.gstPercent;
  const percent = enabled ? Number(cfg.gstPercent) : 0;
  return {
    enabled,
    percent,
    inclusive: cfg.gstInclusive !== false,
    cgstPercent: percent / 2,
    sgstPercent: percent / 2,
    igstPercent: 0,
    gstin: cfg.gstin || '',
    stateName: cfg.stateName || '',
  };
}

// Given a grand total and a gst snapshot, compute the taxable/CGST/SGST breakup.
// Mirrors frontend computeGst() in bill.js so backend-stored amounts and
// frontend-rendered amounts agree for the same document.
function computeGstFromSnapshot(total, gst) {
  if (!gst || !gst.enabled) return null;
  const rate = gst.percent / 100;
  if (gst.inclusive) {
    const net = total / (1 + rate);
    const gstAmt = total - net;
    return { net, gst: gstAmt, cgst: gstAmt / 2, sgst: gstAmt / 2, grandTotal: total };
  }
  const gstAmt = total * rate;
  return { net: total, gst: gstAmt, cgst: gstAmt / 2, sgst: gstAmt / 2, grandTotal: total + gstAmt };
}

module.exports = { getGstSnapshot, computeGstFromSnapshot, DEFAULT_BUSINESS };
