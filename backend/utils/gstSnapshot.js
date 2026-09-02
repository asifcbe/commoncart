const AppSettings = require('../models/AppSettings');

const BUSINESS_KEY = 'BUSINESS_CONFIG';
const DEFAULT_BUSINESS = { gstEnabled: false, gstPercent: 18, gstInclusive: true, gstin: '', stateName: '' };

// Reads the shop-wide GST config and returns a plain snapshot object to be
// stored on a document (SaleTransaction/CreditNote) at creation time, so the
// document's tax basis never drifts if the shop's rate setting changes later.
// Always intra-state (CGST+SGST 50/50); no IGST support. `percent` here is
// the shop's DEFAULT rate — individual line items may override it via their
// own gstPercent (see computeItemizedGst below), so this snapshot is no
// longer literally "the" rate for every line, just the fallback rate.
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

// Per-item GST: each item's own rate (falling back to the shop/document
// default when unset) is applied to that item's own line value, inclusive/
// exclusive per the shop's single global toggle. Groups the result by
// (hsnCode + rate) for the HSN-summary-style breakdown, and also returns a
// blended bottom-line total for callers that just need one figure.
//
// items: [{ price, qty, hsnCode, gstPercent }] — price/qty should already be
//   the actual line values to tax (i.e. discount/round-off already folded in
//   proportionally by the caller, same as the old computeHsnBreakup did).
// opts: { enabled, inclusive, defaultPercent } — the shop/document's own GST
//   config; defaultPercent is used for any item whose own gstPercent is null.
//
// Returns null when GST is disabled. `distinctRates` tells the caller
// whether a single Taxable/CGST/SGST triple is still accurate (<=1) or a
// per-rate breakdown must be shown instead (>=2).
function computeItemizedGst(items, { enabled, inclusive, defaultPercent }) {
  if (!enabled) return null;
  const list = items || [];
  if (!list.length) return null;

  const groups = new Map(); // key: `${hsnCode}|${rate}`
  let netTotal = 0;
  let gstTotal = 0;
  let grossTotal = 0;

  for (const it of list) {
    const rate = it.gstPercent != null ? Number(it.gstPercent) : (Number(defaultPercent) || 0);
    const lineGross = Number(it.price) * Number(it.qty);
    grossTotal += lineGross;
    const r = rate / 100;
    const lineNet = rate > 0 && inclusive ? lineGross / (1 + r) : lineGross;
    const lineGst = rate > 0 ? (inclusive ? lineGross - lineNet : lineGross * r) : 0;

    netTotal += lineNet;
    gstTotal += lineGst;

    const hsnCode = (it.hsnCode || '').trim();
    const key = `${hsnCode}|${rate}`;
    const g = groups.get(key) || { hsnCode, rate, net: 0, gst: 0 };
    g.net += lineNet;
    g.gst += lineGst;
    groups.set(key, g);
  }
  if (grossTotal <= 0) return null;

  const grandTotal = inclusive ? grossTotal : netTotal + gstTotal;
  const rows = [...groups.values()]
    .map((g) => ({ hsnCode: g.hsnCode, rate: g.rate, halfRate: g.rate / 2, taxableValue: g.net, cgst: g.gst / 2, sgst: g.gst / 2 }))
    .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.rate - b.rate);

  return {
    net: netTotal,
    gst: gstTotal,
    cgst: gstTotal / 2,
    sgst: gstTotal / 2,
    grandTotal,
    inclusive,
    rows,
    distinctRates: new Set(rows.map((r) => r.rate)).size,
  };
}

module.exports = { getGstSnapshot, computeItemizedGst, DEFAULT_BUSINESS };
