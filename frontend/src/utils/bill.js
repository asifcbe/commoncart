// Shared bill / receipt helpers used by POS and Sales History.
// Centralises business header + GST breakup so every bill is consistent.

import JsBarcode from 'jsbarcode';
import { formatDateTime } from './date';

// Render a CODE128 barcode for the bill number into a PNG data-URI.
// The bill number itself is the barcode value, so scanning it returns the number.
export function billBarcodeDataURL(billNumber) {
  if (!billNumber) return null;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, String(billNumber), {
      format: 'CODE128', width: 3, height: 80, displayValue: true,
      fontSize: 18, fontOptions: 'bold', textMargin: 4,
      margin: 6, background: '#ffffff', lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

const DEFAULT_BUSINESS = {
  businessName: 'CommonCart Store',
  addressLine: '', phone: '', email: '',
  gstin: '', gstEnabled: false, gstPercent: 18, gstInclusive: true,
  stateName: '', footerNote: 'Thank you for shopping!',
};

// Compute GST breakup for a given grand total based on business config.
// Returns null when GST is disabled.
//  - inclusive: GST is the portion already inside `total`; net = total - gst
//  - exclusive: GST is added on top; the bill's grand total becomes total + gst
// GST is split into CGST + SGST (intra-state), each = half the total GST/rate.
//
// `docGstSnapshot` (optional): a document's own stored `gst` snapshot
// ({enabled, percent, inclusive}) — preferred over the live `business` config
// when present, so a document's tax basis never drifts if the shop's rate
// setting changes after the document was created. Old documents without a
// snapshot simply omit this arg and fall back to live config, unchanged.
export function computeGst(total, business, docGstSnapshot) {
  const b = docGstSnapshot?.enabled != null
    ? { gstEnabled: docGstSnapshot.enabled, gstPercent: docGstSnapshot.percent, gstInclusive: docGstSnapshot.inclusive }
    : (business || DEFAULT_BUSINESS);
  if (!b.gstEnabled || !b.gstPercent) return null;
  const rate = Number(b.gstPercent) / 100;
  const fromBreakup = (net, gst, grandTotal, inclusive) => ({
    inclusive,
    rate: b.gstPercent,
    halfRate: b.gstPercent / 2, // CGST % = SGST %
    net,
    gst,
    cgst: gst / 2,
    sgst: gst / 2,
    grandTotal,
  });
  if (b.gstInclusive) {
    const net = total / (1 + rate);
    return fromBreakup(net, total - net, total, true);
  }
  const gst = total * rate;
  return fromBreakup(total, gst, total + gst, false);
}

// ─── Paper sizes ─────────────────────────────────────────────
// Resolve a bill-print config into a concrete page geometry.
//  - roll formats (thermal): fixed width, auto height, no @page margins
//  - sheet formats (A4/A5): standard page with margins
export function resolveBillPaper(config) {
  const c = config || {};
  const size = c.paperSize || '80mm';
  if (size === '58mm') return { kind: 'roll', widthMm: 58, contentMm: 54, page: 'size: 58mm auto; margin: 0;' };
  if (size === 'custom') {
    const w = Math.max(40, Math.min(210, Number(c.customWidthMm) || 80));
    return { kind: 'roll', widthMm: w, contentMm: w - 4, page: `size: ${w}mm auto; margin: 0;` };
  }
  if (size === 'A4') return { kind: 'sheet', widthMm: 210, contentMm: 180, page: 'size: A4; margin: 12mm;' };
  if (size === 'A5') return { kind: 'sheet', widthMm: 148, contentMm: 128, page: 'size: A5; margin: 10mm;' };
  // default 80mm
  return { kind: 'roll', widthMm: 80, contentMm: 72, page: 'size: 80mm auto; margin: 0;' };
}

// Carried-forward settlement from a prior return/exchange session (see
// SaleTransaction.carriedSettlement) — a non-taxable cash adjustment applied
// on top of the GST-computed grand total, never folded into the tax base.
export function carriedSettlementOf(sale) {
  const amount = sale.carriedSettlement?.amount || 0;
  if (!amount) return null;
  return { amount, sourceLabel: sale.carriedSettlement?.sourceLabel || 'Carried forward' };
}

// Per-item GST — each item's own rate (falling back to the shop/document
// default when unset) is applied to that item's own line value, inclusive/
// exclusive per the shop's single global toggle (unchanged — still bill-wide).
// Groups the result by (hsnCode + rate) for the HSN-summary table, and also
// returns a blended bottom-line total for callers that just need one figure.
// Mirrors backend/utils/gstSnapshot.js's computeItemizedGst so backend-
// computed (Credit Note) and frontend-computed (live bill render) figures
// never drift.
//
// items: [{ price, qty, hsnCode, gstPercent }] — price*qty should already be
//   each line's actual taxable-basis value (discount/round-off pre-scaled in
//   proportionally by the caller — see buildBillBodyHTML's `scaledItems`).
// docGstSnapshot (optional): a document's own stored `gst` snapshot,
//   preferred over live `business` config — same precedence rule as computeGst.
//
// Returns null when GST is disabled or there's nothing to tax. `distinctRates`
// tells the caller whether a single Taxable/CGST/SGST triple is still
// accurate (<=1, the common case) or a per-rate breakdown must be shown
// instead (>=2 — a bill mixing e.g. 5% and 12% items).
export function computeItemizedGst(items, business, docGstSnapshot) {
  const b = docGstSnapshot?.enabled != null
    ? { gstEnabled: docGstSnapshot.enabled, gstPercent: docGstSnapshot.percent, gstInclusive: docGstSnapshot.inclusive }
    : (business || DEFAULT_BUSINESS);
  if (!b.gstEnabled) return null;
  const list = items || [];
  if (!list.length) return null;

  const inclusive = b.gstInclusive !== false;
  const defaultPercent = Number(b.gstPercent) || 0;
  const groups = new Map(); // key: `${hsnCode}|${rate}`
  let netTotal = 0;
  let gstTotal = 0;
  let grossTotal = 0;

  for (const it of list) {
    const rate = it.gstPercent != null ? Number(it.gstPercent) : defaultPercent;
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
    .sort((a, b2) => a.hsnCode.localeCompare(b2.hsnCode) || a.rate - b2.rate);

  return {
    net: netTotal,
    gst: gstTotal,
    cgst: gstTotal / 2,
    sgst: gstTotal / 2,
    grandTotal,
    inclusive,
    rate: rows.length === 1 ? rows[0].rate : defaultPercent,
    halfRate: rows.length === 1 ? rows[0].halfRate : defaultPercent / 2,
    rows,
    distinctRates: new Set(rows.map((r) => r.rate)).size,
  };
}

// Scales each item's price so the sum of (price*qty) equals `goodsAmount` —
// the same "proportional to gross line value" allocation the old
// computeHsnBreakup used, now applied per-line before grouping instead of
// per-group after. Shared by every bill-rendering call site so discount/
// round-off is spread identically everywhere.
export function scaleItemsToGoodsAmount(items, goodsAmount) {
  const list = items || [];
  const grossTotal = list.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
  const scale = grossTotal > 0 ? goodsAmount / grossTotal : 1;
  return list.map((it) => ({ ...it, price: Number(it.price) * scale }));
}

// Turns a computeItemizedGst() result into totals-table rows, all tagged
// 'tax' so the section-divider logic treats them as one group regardless of
// how many rows there are. distinctRates<=1 (the common case — every item on
// the bill shares one rate) renders the old single Taxable/CGST/SGST triple,
// byte-for-byte the same output as before this change. distinctRates>=2
// renders one triple per distinct rate instead, so a bill mixing e.g. 5% and
// 12% items shows each rate's own tax separately rather than a misleading
// blended figure. Shared by every totals-table-shaped bill surface.
export function gstTotalsRows(gst) {
  if (gst.distinctRates <= 1) {
    return [
      ['Taxable Value', `₹${gst.net.toFixed(2)}`, false, 'tax'],
      [`CGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}`, `₹${gst.cgst.toFixed(2)}`, false, 'tax'],
      [`SGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}`, `₹${gst.sgst.toFixed(2)}`, false, 'tax'],
    ];
  }
  // Collapse the (hsnCode+rate) rows down to just rate, summing taxable/cgst/sgst
  // across HSN codes that share a rate — this is a per-rate summary, the
  // finer per-HSN detail still lives in the HSN Summary table below it.
  const byRate = new Map();
  for (const r of gst.rows) {
    const g = byRate.get(r.rate) || { rate: r.rate, halfRate: r.halfRate, taxableValue: 0, cgst: 0, sgst: 0 };
    g.taxableValue += r.taxableValue; g.cgst += r.cgst; g.sgst += r.sgst;
    byRate.set(r.rate, g);
  }
  const rows = [];
  for (const g of [...byRate.values()].sort((a, b) => a.rate - b.rate)) {
    rows.push([`Taxable Value @ ${g.rate}%`, `₹${g.taxableValue.toFixed(2)}`, false, 'tax']);
    rows.push([`CGST @ ${g.halfRate}%${gst.inclusive ? ' (incl.)' : ''}`, `₹${g.cgst.toFixed(2)}`, false, 'tax']);
    rows.push([`SGST @ ${g.halfRate}%${gst.inclusive ? ' (incl.)' : ''}`, `₹${g.sgst.toFixed(2)}`, false, 'tax']);
  }
  return rows;
}

// Build the inner bill body HTML (no <html>/<head>) — shared by print, PDF, image.
// `kind` ('roll' | 'sheet') selects a compact thermal receipt vs. a full invoice.
// `extra` may carry { pointsEarned, pointsRedeemed, pointsEarnedRedeemedNow, balancePoints, customer }
export function buildBillBodyHTML(sale, business, kind = 'roll', extra = {}) {
  const b = { ...DEFAULT_BUSINESS, ...(business || {}) };
  // sale.discountAmount bundles coupon + manual discount + points redeemed
  // (both from-balance and redeemed-now) into one figure — split the points
  // portion back out so the "Discount" and "Points Redeemed" lines below
  // don't both list the same rupees (they used to double-count).
  const discount = sale.discountAmount || 0;
  const nonPointsDiscount = Math.max(0, discount - (Number(extra.pointsRedeemedValue ?? extra.pointsRedeemed) || 0));
  // sale.totalAmount has round-off baked into it at checkout (see
  // SaleTransaction.roundOffAmount's schema comment) — back it back out here
  // so GST is computed on the goods-only amount, never on a non-taxable
  // rounding tweak (same rule this file already applies to carriedSettlement).
  const roundOffAmount = sale.roundOffAmount || 0;
  const goodsAmount = sale.totalAmount - roundOffAmount;
  // Each item taxed at its OWN GST % (falling back to the shop/document
  // default) — not one blended shop-wide rate. Items are pre-scaled so their
  // gross sums to goodsAmount (discount/round-off already excluded), the
  // same proportional allocation the old single-rate calc used.
  const scaledItems = scaleItemsToGoodsAmount(sale.items, goodsAmount);
  const gst = computeItemizedGst(scaledItems, b, sale.gst);
  const hsnRows = gst ? gst.rows : null;
  const hasDiscounted = sale.items.some((i) => i.isDiscounted);
  const grand = gst ? gst.grandTotal : goodsAmount;
  const carried = carriedSettlementOf(sale);
  const netPayable = grand + roundOffAmount + (carried?.amount || 0);
  const pointsEarned = Number(extra.pointsEarned) || 0;
  const pointsRedeemed = Number(extra.pointsRedeemed) || 0;
  // Rupee value of pointsRedeemed — NOT the same number as the point count
  // whenever CREDIT_CONFIG.pointValue isn't 1. Falls back to the point count
  // for older callers that don't pass this yet.
  const pointsRedeemedValue = extra.pointsRedeemedValue != null ? Number(extra.pointsRedeemedValue) : pointsRedeemed;
  const pointsEarnedRedeemedNow = Number(extra.pointsEarnedRedeemedNow) || 0;
  const balancePoints = extra.balancePoints != null ? Number(extra.balancePoints) : null;
  const customerName = extra.customer?.name || sale.customer?.name || null;
  const customerPhone = extra.customer?.phone || sale.customer?.phone || sale.customerPhone || null;
  // Staff attribution — `sale.soldBy` is populated with `.name` wherever the
  // sale was fetched from the API (Sales History); immediately after POS
  // checkout the transaction doc isn't populated yet, so the caller passes
  // the already-known name via extra.billedByName instead.
  const billedByName = extra.billedByName || sale.soldBy?.name || null;
  const splitPayments = sale.splitPayments || [];
  const paymentLabel = splitPayments.length
    ? splitPayments.map((p) => `${p.method} ₹${Number(p.amount).toFixed(2)}`).join(' + ')
    : sale.paymentMethod;
  // goodsAmount is stored net of discount (goods total minus discountAmount,
  // see processStoreSale) — add the discount back to show the true pre-discount
  // bill value, not the same figure as the final payable total.
  const billValue = goodsAmount + discount;
  // Computed once, shared by both layouts below — every printed/exported bill
  // (thermal or A4/A5) carries the same scannable bill-number barcode.
  const barcodeImg = billBarcodeDataURL(sale.transactionId);

  if (kind === 'sheet') {
    const anyHsn = sale.items.some((it) => it.hsnCode);
    return invoiceLayout({
    title: 'TAX INVOICE',
    business: b,
    barcodeImg,
    meta: [
      ['Bill No', sale.transactionId],
      ['Date', formatDateTime(sale.createdAt)],
      ['Payment', paymentLabel],
      ...(customerName ? [['Customer', customerPhone ? `${customerName} (${customerPhone})` : customerName]] : []),
      ...(billedByName ? [['Billed By', billedByName]] : []),
    ],
    columns: anyHsn ? ['#', 'Item', 'HSN', 'Qty', 'Rate', 'Amount'] : ['#', 'Item', 'Qty', 'Rate', 'Amount'],
    align: anyHsn ? ['left', 'left', 'left', 'right', 'right', 'right'] : ['left', 'left', 'right', 'right', 'right'],
    rows: sale.items.map((it, i) => [
      i + 1,
      it.name + (it.isDiscounted ? ' (Discounted)' : ''),
      ...(anyHsn ? [it.hsnCode || '—'] : []),
      it.qty,
      `₹${Number(it.price).toFixed(2)}`,
      `₹${(it.price * it.qty).toFixed(2)}`,
    ]),
    hsnRows,
    // Each row's 4th element groups it for the thin section-divider rule in
    // invoiceLayout: 'adjust' = pre-tax bill value/discount/round-off/points,
    // 'tax' = the GST breakup, 'settle' = carry-forward sitting between tax
    // and the final payable figure, 'loyalty' = forward-looking points info
    // after the total. Reads top-to-bottom as: what the goods cost → what's
    // taken off (discount, round-off, points) → the tax on what's left →
    // any carried-forward settlement → what's actually payable → loyalty balance.
    totals: [
      ...(discount > 0 ? [['Bill Value', `₹${billValue.toFixed(2)}`, false, 'adjust']] : []),
      ...(nonPointsDiscount > 0 ? [['Discount', `-₹${nonPointsDiscount.toFixed(2)}`, false, 'adjust']] : []),
      ...(roundOffAmount !== 0 ? [['Round Off', `${roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(roundOffAmount).toFixed(2)}`, false, 'adjust']] : []),
      ...(pointsRedeemed > 0 ? [[`Points (${pointsRedeemed} pts)`, `-₹${pointsRedeemedValue.toFixed(2)}`, false, 'adjust']] : []),
      ...(gst ? gstTotalsRows(gst) : []),
      ...(carried ? [[carried.sourceLabel, `${carried.amount > 0 ? '+' : '-'}₹${Math.abs(carried.amount).toFixed(2)}`, false, 'settle']] : []),
      [carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL', `₹${Math.abs(netPayable).toFixed(2)}`, true, 'final'],
      ...(pointsEarnedRedeemedNow > 0
        ? [[`Points Earned & Redeemed This Bill`, `+${pointsEarnedRedeemedNow} pts (-₹${pointsEarnedRedeemedNow.toFixed(2)})`, false, 'loyalty']]
        : pointsEarned > 0 ? [[`Points Earned`, `+${pointsEarned} pts`, false, 'loyalty']] : []),
      ...(balancePoints !== null ? [[`Balance Points`, `${balancePoints} pts`, false, 'loyalty']] : []),
    ],
    note: hasDiscounted ? '* Discounted items cannot be replaced or exchanged.' : '',
    footer: b.footerNote || 'Thank you for shopping!',
  });
  }

  // ── Thermal receipt (roll) ──
  // Everything is pure black on white for maximum thermal-print contrast and
  // on-screen readability — no light greys.
  const itemsHTML = sale.items.map((item, i) =>
    `<div style="display:flex;justify-content:space-between;font-size:13px;margin:3px 0;color:#000;font-weight:600;">
      <span>${i + 1}. ${item.name}${item.isDiscounted ? ' <em style="color:#000;font-size:11px;">(Discounted)</em>' : ''} x${item.qty}</span>
      <span>₹${(item.price * item.qty).toFixed(2)}</span>
    </div>`
  ).join('');
  const headerLines = [
    `<strong style="font-size:18px;color:#000;">${b.businessName}</strong>`,
    b.addressLine ? `<span style="font-size:11px;color:#000;">${b.addressLine}</span>` : '',
    b.phone ? `<span style="font-size:11px;color:#000;">Ph: ${b.phone}</span>` : '',
    b.gstin ? `<span style="font-size:11px;color:#000;">GSTIN: ${b.gstin}</span>` : '',
  ].filter(Boolean).join('<br/>');
  // Same distinctRates branch as gstTotalsRows: one triple when the bill has
  // a single effective rate, one triple per rate when it mixes rates.
  const gstHTML = gst
    ? gstTotalsRows(gst).map(([label, val]) =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;"><span>${label}</span><span>${val}</span></div>`
      ).join('')
    : '';
  const hsnHTMLRoll = hsnRows && hsnRows.length
    ? `<div style="margin-top:6px;border-top:1px dashed #000;padding-top:5px;">
        <div style="font-size:11px;font-weight:700;color:#000;margin-bottom:2px;">HSN Summary</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:#000;"><span>HSN</span><span>Rate</span><span>Taxable</span><span>CGST</span><span>SGST</span></div>
        ${hsnRows.map((r) => `<div style="display:flex;justify-content:space-between;font-size:10px;color:#000;"><span>${r.hsnCode || '—'}</span><span>${r.rate}%</span><span>₹${r.taxableValue.toFixed(2)}</span><span>₹${r.cgst.toFixed(2)}</span><span>₹${r.sgst.toFixed(2)}</span></div>`).join('')}
      </div>`
    : '';
  const roundOffHTML = roundOffAmount !== 0
    ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;font-weight:700;"><span>Round Off</span><span>${roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(roundOffAmount).toFixed(2)}</span></div>`
    : '';
  const carriedHTML = carried
    ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;font-weight:700;"><span>${carried.sourceLabel}</span><span>${carried.amount > 0 ? '+' : '-'}₹${Math.abs(carried.amount).toFixed(2)}</span></div>`
    : '';
  // "Points Redeemed" reduces what's owed, so it belongs in the totals block
  // above the final amount, same as Discount/GST/Round Off — Points Earned
  // and Balance Points are forward-looking loyalty info, not part of this
  // bill's payable amount, so they stay in their own block after the total.
  const pointsRedeemedHTML = pointsRedeemed > 0
    ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;font-weight:700;"><span>Points (${pointsRedeemed} pts)</span><span>-₹${pointsRedeemedValue.toFixed(2)}</span></div>`
    : '';
  const pointsHTML = (pointsEarned > 0 || balancePoints !== null)
    ? `<div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;">
        ${pointsEarnedRedeemedNow > 0
          ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;"><span>Points Earned &amp; Redeemed This Bill</span><span>+${pointsEarnedRedeemedNow} pts (-₹${pointsEarnedRedeemedNow.toFixed(2)})</span></div>`
          : (pointsEarned > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;"><span>Points Earned</span><span>+${pointsEarned} pts</span></div>` : '')}
        ${balancePoints !== null ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;"><span>Balance Points</span><span>${balancePoints} pts</span></div>` : ''}
      </div>`
    : '';

  return `
<div style="color:#000;font-weight:500;">
<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px;">
  ${headerLines}<br/>
  <span style="font-size:12px;color:#000;">${formatDateTime(sale.createdAt)}</span><br/>
  <span style="font-size:13px;font-weight:bold;color:#000;">Bill No: ${sale.transactionId}</span>
  ${customerName ? `<br/><span style="font-size:12px;color:#000;">Customer: ${customerName}${customerPhone ? ` (${customerPhone})` : ''}</span>` : ''}
</div>
${itemsHTML}
<div style="border-top:2px solid #000;margin-top:6px;padding-top:6px;">
  ${discount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;color:#000;"><span>Bill Value</span><span>₹${billValue.toFixed(2)}</span></div>` : ''}
  ${nonPointsDiscount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#000;font-weight:700;"><span>Discount</span><span>-₹${nonPointsDiscount.toFixed(2)}</span></div>` : ''}
  ${roundOffHTML}
  ${pointsRedeemedHTML}
  ${gst ? `<div style="border-top:1px dashed #000;margin-top:5px;padding-top:5px;">${gstHTML}</div>` : ''}
  ${carried ? `<div style="border-top:1px dashed #000;margin-top:5px;padding-top:5px;">${carriedHTML}</div>` : ''}
  <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin-top:6px;padding-top:5px;border-top:2px solid #000;color:#000;"><span>${carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL'}</span><span>₹${Math.abs(netPayable).toFixed(2)}</span></div>
  <div style="font-size:12px;color:#000;margin-top:2px;font-weight:600;">Payment: ${paymentLabel}</div>
</div>
${hsnHTMLRoll}
${pointsHTML}
${hasDiscounted ? '<p style="font-size:11px;color:#000;font-weight:700;margin-top:8px;border-top:1px dashed #000;padding-top:6px;">* Discounted items cannot be replaced or exchanged.</p>' : ''}
${barcodeImg ? `<div style="text-align:center;margin-top:10px;border-top:2px solid #000;padding-top:10px;"><img src="${barcodeImg}" style="width:100%;max-width:340px;" alt="${sale.transactionId}" /></div>` : ''}
<div style="text-align:center;font-size:11px;color:#000;margin-top:8px;font-weight:600;white-space:pre-line;">${b.footerNote || 'Thank you for shopping!'}</div>
${billedByName ? `<div style="text-align:center;font-size:9px;color:#000;margin-top:4px;">Billed by: ${billedByName}</div>` : ''}
</div>`;
}

// Shared full-page invoice layout for A4/A5 (sale + purchase).
// opts: { title, business, meta:[[label,val]], columns:[], align:[], rows:[[]], totals:[[label,val,bold]], note, footer }
export function invoiceLayout(opts) {
  const b = opts.business || {};
  const esc = (v) => String(v == null ? '' : v);
  const headRight = [
    b.phone ? `Ph: ${b.phone}` : '',
    b.email ? b.email : '',
    b.gstin ? `GSTIN: ${b.gstin}` : '',
    b.stateName ? `State: ${b.stateName}` : '',
  ].filter(Boolean).join('<br/>');

  const metaHTML = (opts.meta || [])
    .map(([k, v]) => `<div style="color:#000;"><span style="color:#000;">${k}:</span> <strong>${esc(v)}</strong></div>`)
    .join('');

  const thead = `<tr>${opts.columns.map((c, i) =>
    `<th style="text-align:${opts.align[i] || 'left'};padding:7px 10px;border-bottom:2px solid #000;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#000;font-weight:800;">${c}</th>`).join('')}</tr>`;
  const tbody = opts.rows.map((r, ri) =>
    `<tr style="background:${ri % 2 ? '#f0f0f0' : '#fff'};">${r.map((cell, i) =>
      `<td style="text-align:${opts.align[i] || 'left'};padding:6px 10px;border-bottom:1px solid #999;font-size:13px;color:#000;">${esc(cell)}</td>`).join('')}</tr>`).join('');

  // Totals rows carry an optional 4th element — a group key ('adjust' | 'tax'
  // | 'settle' | 'final' | 'loyalty') — so a thin top border can mark where
  // one logical group ends and the next begins, instead of one
  // undifferentiated list. Split into two tables at the 'final' (TOTAL/Net
  // Payable) row so the HSN Summary can be inserted between the total and
  // the loyalty rows that follow it.
  const allTotals = opts.totals || [];
  const finalIdx = allTotals.findIndex(([, , , group]) => group === 'final');
  const renderRows = (rows) => {
    let prevGroup = null;
    return rows.map(([label, val, bold, group]) => {
      const groupBreak = group && prevGroup && group !== prevGroup;
      prevGroup = group;
      const borderTop = bold ? '2px solid #000' : (groupBreak ? '1px solid #ccc' : 'none');
      const cellStyle = `padding:4px 10px;text-align:right;color:#000;border-top:${borderTop};${bold ? 'font-weight:800;font-size:16px;' : 'font-size:13px;'}${groupBreak && !bold ? 'padding-top:8px;' : ''}`;
      return `<tr>
       <td style="${cellStyle}">${label}</td>
       <td style="${cellStyle}width:130px;">${esc(val)}</td>
     </tr>`;
    }).join('');
  };
  const totalsHTML = finalIdx === -1 ? renderRows(allTotals) : renderRows(allTotals.slice(0, finalIdx + 1));
  const loyaltyHTML = finalIdx === -1 ? '' : renderRows(allTotals.slice(finalIdx + 1));

  // GST-compliant HSN-wise tax summary — one row per (HSN code + GST rate)
  // group with its own taxable value + CGST/SGST, since two items can share
  // an HSN code but be taxed at different rates, or vice versa. Always
  // rendered when GST applies, even for a single HSN/rate, since a GST
  // invoice must carry the HSN code on its face. Placed below the TOTAL/Net
  // Payable line and above the Points Earned/Balance Points rows.
  const hsnHTML = (opts.hsnRows && opts.hsnRows.length) ? `
  <div style="margin-top:6px;">
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#000;margin-bottom:3px;">HSN Summary</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:4px 8px;border-bottom:1px solid #000;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#000;font-weight:800;">HSN</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #000;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#000;font-weight:800;">Rate</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #000;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#000;font-weight:800;">Taxable</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #000;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#000;font-weight:800;">CGST</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #000;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#000;font-weight:800;">SGST</th>
      </tr></thead>
      <tbody>${opts.hsnRows.map((r, ri) => `<tr style="background:${ri % 2 ? '#f6f6f6' : '#fff'};">
        <td style="padding:3px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#000;">${esc(r.hsnCode || '—')}</td>
        <td style="text-align:right;padding:3px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#000;">${r.rate}%</td>
        <td style="text-align:right;padding:3px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#000;">₹${r.taxableValue.toFixed(2)}</td>
        <td style="text-align:right;padding:3px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#000;">₹${r.cgst.toFixed(2)}</td>
        <td style="text-align:right;padding:3px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#000;">₹${r.sgst.toFixed(2)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>` : '';

  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#000;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:12px;">
    <div>
      <div style="font-size:22px;font-weight:800;letter-spacing:.02em;color:#000;">${esc(b.businessName)}</div>
      ${b.addressLine ? `<div style="font-size:12px;color:#000;margin-top:3px;max-width:300px;">${esc(b.addressLine)}</div>` : ''}
    </div>
    <div style="text-align:right;font-size:12px;color:#000;line-height:1.5;">${headRight}</div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 10px;">
    <div style="font-size:16px;font-weight:800;letter-spacing:.08em;color:#000;">${opts.title}</div>
    <div style="font-size:12px;text-align:right;line-height:1.6;color:#000;">${metaHTML}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:4px;">
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:10px;">
    <div style="min-width:280px;">
      <table style="border-collapse:collapse;width:100%;"><tbody>${totalsHTML}</tbody></table>
      ${hsnHTML}
      ${loyaltyHTML ? `<table style="border-collapse:collapse;width:100%;"><tbody>${loyaltyHTML}</tbody></table>` : ''}
    </div>
  </div>

  ${opts.note ? `<p style="font-size:11px;color:#000;font-weight:700;margin-top:16px;border-top:1px solid #999;padding-top:8px;">${opts.note}</p>` : ''}
  ${opts.barcodeImg ? `<div style="text-align:center;margin-top:16px;"><img src="${opts.barcodeImg}" style="max-width:360px;width:100%;" alt="barcode" /></div>` : ''}
  <div style="text-align:center;font-size:11px;color:#000;margin-top:18px;border-top:1px solid #999;padding-top:10px;white-space:pre-line;">${esc(opts.footer || '')}</div>
</div>`;
}

// Build a printable Credit Note body — always a full-page A4/A5 layout
// (formal GST document, not a thermal-roll receipt).
export function buildCreditNoteHTML(creditNote, business) {
  const b = { ...DEFAULT_BUSINESS, ...(business || {}) };
  // gstBreakup (per hsnCode+rate group, populated by returnSessionController)
  // drives both the totals' tax lines and the HSN Summary table below — same
  // distinctRates rule as a sale: one triple when every returned line shares
  // a rate, one triple per rate when they don't.
  const breakup = creditNote.gstBreakup || [];
  const distinctRates = new Set(breakup.map((r) => r.rate)).size;
  const gstTotalLines = creditNote.gst?.enabled
    ? (distinctRates <= 1
        ? [
            ['Taxable Value', `₹${creditNote.taxableValue.toFixed(2)}`, false],
            [`CGST @ ${creditNote.gst.cgstPercent}%`, `₹${creditNote.cgstAmount.toFixed(2)}`, false],
            [`SGST @ ${creditNote.gst.sgstPercent}%`, `₹${creditNote.sgstAmount.toFixed(2)}`, false],
          ]
        : (() => {
            const byRate = new Map();
            for (const r of breakup) {
              const g = byRate.get(r.rate) || { rate: r.rate, taxableValue: 0, cgstAmount: 0, sgstAmount: 0 };
              g.taxableValue += r.taxableValue; g.cgstAmount += r.cgstAmount; g.sgstAmount += r.sgstAmount;
              byRate.set(r.rate, g);
            }
            const lines = [];
            for (const g of [...byRate.values()].sort((a, c) => a.rate - c.rate)) {
              lines.push([`Taxable Value @ ${g.rate}%`, `₹${g.taxableValue.toFixed(2)}`, false]);
              lines.push([`CGST @ ${g.rate / 2}%`, `₹${g.cgstAmount.toFixed(2)}`, false]);
              lines.push([`SGST @ ${g.rate / 2}%`, `₹${g.sgstAmount.toFixed(2)}`, false]);
            }
            return lines;
          })())
    : [];
  return invoiceLayout({
    title: 'CREDIT NOTE',
    business: b,
    meta: [
      ['Credit Note No', creditNote.creditNoteNumber],
      ['Date', formatDateTime(creditNote.createdAt)],
      ['Against Invoice', creditNote.originalTransactionId],
      ...(creditNote.linkedNewTransactionId ? [['New Invoice', creditNote.linkedNewTransactionId]] : []),
    ],
    columns: ['#', 'Item', 'Qty', 'Rate', 'Amount', 'Type'],
    align: ['left', 'left', 'right', 'right', 'right', 'left'],
    rows: creditNote.items.map((it, i) => [
      i + 1, it.name, it.qty, `₹${Number(it.price).toFixed(2)}`, `₹${(it.price * it.qty).toFixed(2)}`,
      it.lineType === 'EXCHANGE_OUT' ? 'Exchanged' : 'Returned',
    ]),
    hsnRows: breakup.length > 1
      ? breakup.map((r) => ({ hsnCode: r.hsnCode, rate: r.rate, taxableValue: r.taxableValue, cgst: r.cgstAmount, sgst: r.sgstAmount }))
      : null,
    totals: [
      ['Item Total', `₹${creditNote.items.reduce((s, it) => s + it.price * it.qty, 0).toFixed(2)}`, false],
      ...(creditNote.netPayableRatio != null && creditNote.netPayableRatio !== 1 ? [
        ['Bill Discount / Round-off Share', `${creditNote.netPayableRatio < 1 ? '-' : '+'}₹${Math.abs(creditNote.items.reduce((s, it) => s + it.price * it.qty, 0) - creditNote.creditNoteTotal).toFixed(2)}`, false],
      ] : []),
      ...gstTotalLines,
      ['CREDIT TOTAL', `₹${creditNote.creditNoteTotal.toFixed(2)}`, true],
    ],
    note: creditNote.gstFallbackUsed ? '* GST basis inferred from current settings (original invoice predates GST snapshotting).' : '',
    footer: b.footerNote || '',
  });
}

// Build a printable Replacement Note body — items only, no money/GST (warranty
// replacements have zero monetary impact).
export function buildReplacementNoteHTML(note, business) {
  const b = { ...DEFAULT_BUSINESS, ...(business || {}) };
  return invoiceLayout({
    title: 'REPLACEMENT NOTE',
    business: b,
    meta: [
      ['Replacement No', note.replacementNumber],
      ['Date', formatDateTime(note.createdAt)],
      ['Against Invoice', note.originalTransactionId],
    ],
    columns: ['#', 'Item', 'Qty'],
    align: ['left', 'left', 'right'],
    rows: note.items.map((it, i) => [i + 1, it.name, it.qty]),
    totals: [],
    note: 'Warranty/defective replacement — no monetary value, no GST impact.',
    footer: b.footerNote || '',
  });
}

// Print a full HTML document in the current tab — no new window/tab. Renders
// into a hidden same-page iframe, triggers that iframe's print dialog, and
// tears the iframe down once the user closes/completes the print (or after a
// fallback timeout for browsers that don't fire 'afterprint' reliably).
function printInCurrentTab(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const win = iframe.contentWindow;
  win.addEventListener('afterprint', cleanup);
  // Fallback in case 'afterprint' never fires (some browsers/print-preview flows) —
  // long enough that it never races a real print, short enough not to leak forever.
  setTimeout(cleanup, 60000);

  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();

  // Wait for every image (the bill-number barcode PNG, even though it's a
  // same-tick data: URI) to actually finish decoding before printing. Calling
  // print() immediately can snapshot the iframe before Chrome paints the
  // image — invisible when the page is idle (e.g. clicking "Print Bill" from
  // an already-open Receipt modal), but reproducible right after checkout
  // when the main thread is still busy with React state updates.
  const images = Array.from(iframe.contentDocument.images);
  const whenReady = images.length
    ? Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      })))
    : Promise.resolve();

  whenReady.then(() => {
    win.focus();
    win.print();
  });
}

// Print a Credit Note or Replacement Note — always full-page (A4/A5-shaped),
// independent of the shop's thermal-receipt billConfig.
export function printDocumentHTML(bodyHTML, title = 'Document') {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0 auto; width: 180mm; max-width: 100%; }
</style></head><body>
${bodyHTML}
</body></html>`;

  printInCurrentTab(html);
}

export function printCreditNoteHTML(creditNote, business) {
  printDocumentHTML(buildCreditNoteHTML(creditNote, business), `Credit Note ${creditNote.creditNoteNumber}`);
}

export function printReplacementNoteHTML(note, business) {
  printDocumentHTML(buildReplacementNoteHTML(note, business), `Replacement Note ${note.replacementNumber}`);
}

// Build and print the bill in the current tab (no new window/tab).
// `billConfig` selects the paper size (see resolveBillPaper).
// `extra` carries points info: { pointsEarned, pointsRedeemed, balancePoints, customer }
export function printBillHTML(sale, business, billConfig, extra = {}) {
  const paper = resolveBillPaper(billConfig);
  const body = buildBillBodyHTML(sale, business, paper.kind, extra);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
<style>
  @page { ${paper.page} }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${paper.kind === 'sheet' ? 'Arial, Helvetica, sans-serif' : 'monospace'}; color: #000; margin: 0 auto; padding: ${paper.kind === 'roll' ? '4px' : '0'}; width: ${paper.contentMm}mm; max-width: 100%; }
</style></head><body>
${body}
</body></html>`;

  printInCurrentTab(html);
}

// Build the WhatsApp text bill and open the share link.
export function shareBillWhatsApp(sale, phone, business, extra = {}) {
  if (!phone) return;
  const b = { ...DEFAULT_BUSINESS, ...(business || {}) };
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;

  // sale.totalAmount has round-off baked into it at checkout — back it back
  // out so GST is computed on the goods-only amount, matching buildBillBodyHTML.
  const roundOffAmount = sale.roundOffAmount || 0;
  const goodsAmount = sale.totalAmount - roundOffAmount;
  const scaledItems = scaleItemsToGoodsAmount(sale.items, goodsAmount);
  const gst = computeItemizedGst(scaledItems, b, sale.gst);
  const lines = [];
  lines.push(`*${b.businessName}*`);
  if (b.addressLine) lines.push(b.addressLine);
  if (b.gstin) lines.push(`GSTIN: ${b.gstin}`);
  lines.push(`Bill #${sale.transactionId}`);
  lines.push(formatDateTime(sale.createdAt));
  lines.push('--------------------------');
  sale.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name} x${it.qty}  -  ₹${(it.price * it.qty).toFixed(2)}`);
  });
  lines.push('--------------------------');
  // sale.discountAmount bundles coupon + manual discount + points redeemed —
  // split the points portion out so it isn't listed twice (once here, once
  // in the "Points Redeemed" line below).
  const pointsRedeemedValue = extra.pointsRedeemedValue != null ? Number(extra.pointsRedeemedValue) : (Number(extra.pointsRedeemed) || 0);
  const nonPointsDiscount = Math.max(0, (sale.discountAmount || 0) - pointsRedeemedValue);
  if (sale.discountAmount > 0) lines.push(`*Bill Value: ₹${(goodsAmount + sale.discountAmount).toFixed(2)}*`);
  if (nonPointsDiscount > 0) lines.push(`Discount: -₹${nonPointsDiscount.toFixed(2)}`);
  if (roundOffAmount !== 0) lines.push(`Round Off: ${roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(roundOffAmount).toFixed(2)}`);
  // Points Redeemed reduces what's owed, so it belongs above the total —
  // Points Earned/Balance Points (forward-looking, not part of this bill's
  // payable amount) stay listed after it, further down.
  if (extra.pointsRedeemed > 0) lines.push(`Points (${extra.pointsRedeemed} pts): -₹${pointsRedeemedValue.toFixed(2)}`);
  if (gst) {
    gstTotalsRows(gst).forEach(([label, val]) => lines.push(`${label}: ${val}`));
  }
  const grand = gst ? gst.grandTotal : goodsAmount;
  const carried = carriedSettlementOf(sale);
  const netPayable = grand + roundOffAmount + (carried?.amount || 0);
  if (carried) lines.push(`${carried.sourceLabel}: ${carried.amount > 0 ? '+' : '-'}₹${Math.abs(carried.amount).toFixed(2)}`);
  lines.push(`*${carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL'}: ₹${Math.abs(netPayable).toFixed(2)}*`);
  const splitPayments = sale.splitPayments || [];
  lines.push(`Payment: ${splitPayments.length ? splitPayments.map((p) => `${p.method} ₹${Number(p.amount).toFixed(2)}`).join(' + ') : sale.paymentMethod}`);
  // HSN Summary sits below the total/payment and above the points detail
  // section, matching every other bill surface.
  if (gst && gst.rows.length) {
    lines.push('--------------------------');
    lines.push('HSN Summary');
    gst.rows.forEach((r) => {
      lines.push(`${r.hsnCode || '—'} @ ${r.rate}%: Taxable ₹${r.taxableValue.toFixed(2)}, CGST ₹${r.cgst.toFixed(2)}, SGST ₹${r.sgst.toFixed(2)}`);
    });
  }
  if (extra.pointsEarnedRedeemedNow > 0) lines.push(`Points Earned & Redeemed This Bill: +${extra.pointsEarnedRedeemedNow} pts (-₹${Number(extra.pointsEarnedRedeemedNow).toFixed(2)})`);
  else if (extra.pointsEarned > 0) lines.push(`Points Earned: +${extra.pointsEarned} pts`);
  if (extra.balancePoints != null) lines.push(`Balance Points: ${extra.balancePoints} pts`);
  lines.push('');
  lines.push(b.footerNote || 'Thank you for shopping with us!');
  const billedByName = extra.billedByName || sale.soldBy?.name || null;
  if (billedByName) lines.push(`_Billed by: ${billedByName}_`);

  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank');
}
