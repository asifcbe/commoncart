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
      format: 'CODE128', width: 2, height: 45, displayValue: true,
      fontSize: 13, margin: 4, background: '#ffffff',
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
  const gst = computeGst(sale.totalAmount, b);
  const hasDiscounted = sale.items.some((i) => i.isDiscounted);
  const grand = gst ? gst.grandTotal : sale.totalAmount;
  const carried = carriedSettlementOf(sale);
  const netPayable = grand + (carried?.amount || 0);
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
  const splitPayments = sale.splitPayments || [];
  const paymentLabel = splitPayments.length
    ? splitPayments.map((p) => `${p.method} ₹${Number(p.amount).toFixed(2)}`).join(' + ')
    : sale.paymentMethod;
  // sale.totalAmount is stored net of discount (goods total minus discountAmount,
  // see processStoreSale) — add the discount back to show the true pre-discount
  // bill value, not the same figure as the final payable total.
  const billValue = sale.totalAmount + discount;
  // Computed once, shared by both layouts below — every printed/exported bill
  // (thermal or A4/A5) carries the same scannable bill-number barcode.
  const barcodeImg = billBarcodeDataURL(sale.transactionId);

  if (kind === 'sheet') return invoiceLayout({
    title: 'TAX INVOICE',
    business: b,
    barcodeImg,
    meta: [
      ['Bill No', sale.transactionId],
      ['Date', formatDateTime(sale.createdAt)],
      ['Payment', paymentLabel],
      ...(customerName ? [['Customer', customerPhone ? `${customerName} (${customerPhone})` : customerName]] : []),
    ],
    columns: ['#', 'Item', 'Qty', 'Rate', 'Amount'],
    align: ['left', 'left', 'right', 'right', 'right'],
    rows: sale.items.map((it, i) => [
      i + 1,
      it.name + (it.isDiscounted ? ' (Discounted)' : ''),
      it.qty,
      `₹${Number(it.price).toFixed(2)}`,
      `₹${(it.price * it.qty).toFixed(2)}`,
    ]),
    totals: [
      ...(discount > 0 ? [['Bill Value', `₹${billValue.toFixed(2)}`, true]] : []),
      ...(nonPointsDiscount > 0 ? [['Discount', `-₹${nonPointsDiscount.toFixed(2)}`, false]] : []),
      ...(pointsRedeemed > 0 ? [[`Points Redeemed (${pointsRedeemed} pts)`, `-₹${pointsRedeemedValue.toFixed(2)}`, false]] : []),
      ...(gst ? [
        ['Taxable Value', `₹${gst.net.toFixed(2)}`, false],
        [`CGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}`, `₹${gst.cgst.toFixed(2)}`, false],
        [`SGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}`, `₹${gst.sgst.toFixed(2)}`, false],
      ] : []),
      ...(carried ? [[carried.sourceLabel, `${carried.amount > 0 ? '+' : '-'}₹${Math.abs(carried.amount).toFixed(2)}`, false]] : []),
      [carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL', `₹${Math.abs(netPayable).toFixed(2)}`, true],
      ...(pointsEarnedRedeemedNow > 0
        ? [[`Points Earned & Redeemed This Bill`, `+${pointsEarnedRedeemedNow} pts (-₹${pointsEarnedRedeemedNow.toFixed(2)})`, false]]
        : pointsEarned > 0 ? [[`Points Earned`, `+${pointsEarned} pts`, false]] : []),
      ...(balancePoints !== null ? [[`Balance Points`, `${balancePoints} pts`, false]] : []),
    ],
    note: hasDiscounted ? '* Discounted items cannot be replaced or exchanged.' : '',
    footer: b.footerNote || 'Thank you for shopping!',
  });

  // ── Thermal receipt (roll) ──
  const itemsHTML = sale.items.map((item, i) =>
    `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0;">
      <span>${i + 1}. ${item.name}${item.isDiscounted ? ' <em style="color:#c00;font-size:10px;">(Discounted)</em>' : ''} x${item.qty}</span>
      <span>₹${(item.price * item.qty).toFixed(2)}</span>
    </div>`
  ).join('');
  const headerLines = [
    `<strong style="font-size:16px;">${b.businessName}</strong>`,
    b.addressLine ? `<span style="font-size:10px;">${b.addressLine}</span>` : '',
    b.phone ? `<span style="font-size:10px;">Ph: ${b.phone}</span>` : '',
    b.gstin ? `<span style="font-size:10px;">GSTIN: ${b.gstin}</span>` : '',
  ].filter(Boolean).join('<br/>');
  const gstHTML = gst
    ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#555;"><span>Taxable Value</span><span>₹${gst.net.toFixed(2)}</span></div>
       <div style="display:flex;justify-content:space-between;font-size:11px;color:#555;"><span>CGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}</span><span>₹${gst.cgst.toFixed(2)}</span></div>
       <div style="display:flex;justify-content:space-between;font-size:11px;color:#555;"><span>SGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}</span><span>₹${gst.sgst.toFixed(2)}</span></div>`
    : '';
  const carriedHTML = carried
    ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:${carried.amount > 0 ? '#c00' : 'green'};"><span>${carried.sourceLabel}</span><span>${carried.amount > 0 ? '+' : '-'}₹${Math.abs(carried.amount).toFixed(2)}</span></div>`
    : '';
  const pointsHTML = (pointsRedeemed > 0 || pointsEarned > 0 || balancePoints !== null)
    ? `<div style="border-top:1px dashed #ccc;margin-top:6px;padding-top:6px;">
        ${pointsRedeemed > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#b45309;"><span>Points Redeemed (${pointsRedeemed} pts)</span><span>-₹${pointsRedeemedValue.toFixed(2)}</span></div>` : ''}
        ${pointsEarnedRedeemedNow > 0
          ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#b45309;"><span>Points Earned &amp; Redeemed This Bill</span><span>+${pointsEarnedRedeemedNow} pts (-₹${pointsEarnedRedeemedNow.toFixed(2)})</span></div>`
          : (pointsEarned > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#1d4ed8;"><span>Points Earned</span><span>+${pointsEarned} pts</span></div>` : '')}
        ${balancePoints !== null ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#1d4ed8;"><span>Balance Points</span><span>${balancePoints} pts</span></div>` : ''}
      </div>`
    : '';

  return `
<div style="text-align:center;border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px;">
  ${headerLines}<br/>
  <span style="font-size:11px;">${formatDateTime(sale.createdAt)}</span><br/>
  <span style="font-size:12px;font-weight:bold;">Bill No: ${sale.transactionId}</span>
  ${customerName ? `<br/><span style="font-size:11px;">Customer: ${customerName}${customerPhone ? ` (${customerPhone})` : ''}</span>` : ''}
</div>
${itemsHTML}
<div style="border-top:1px dashed #ccc;margin-top:6px;padding-top:6px;">
  ${discount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;"><span>Bill Value</span><span>₹${billValue.toFixed(2)}</span></div>` : ''}
  ${nonPointsDiscount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:green;"><span>Discount</span><span>-₹${nonPointsDiscount.toFixed(2)}</span></div>` : ''}
  ${gstHTML}
  ${carriedHTML}
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:4px;"><span>${carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL'}</span><span>₹${Math.abs(netPayable).toFixed(2)}</span></div>
  <div style="font-size:11px;color:#555;margin-top:2px;">Payment: ${paymentLabel}</div>
</div>
${pointsHTML}
${hasDiscounted ? '<p style="font-size:10px;color:#c00;margin-top:8px;border-top:1px dashed #ccc;padding-top:6px;">* Discounted items cannot be replaced or exchanged.</p>' : ''}
${barcodeImg ? `<div style="text-align:center;margin-top:10px;border-top:1px dashed #ccc;padding-top:8px;"><img src="${barcodeImg}" style="max-width:100%;" alt="${sale.transactionId}" /></div>` : ''}
<div style="text-align:center;font-size:10px;color:#888;margin-top:8px;">${b.footerNote || 'Thank you for shopping!'}</div>`;
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
    .map(([k, v]) => `<div><span style="color:#666;">${k}:</span> <strong>${esc(v)}</strong></div>`)
    .join('');

  const thead = `<tr>${opts.columns.map((c, i) =>
    `<th style="text-align:${opts.align[i] || 'left'};padding:7px 10px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#444;">${c}</th>`).join('')}</tr>`;
  const tbody = opts.rows.map((r, ri) =>
    `<tr style="background:${ri % 2 ? '#fafafa' : '#fff'};">${r.map((cell, i) =>
      `<td style="text-align:${opts.align[i] || 'left'};padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">${esc(cell)}</td>`).join('')}</tr>`).join('');

  const totalsHTML = (opts.totals || []).map(([label, val, bold]) =>
    `<tr>
       <td style="padding:4px 10px;text-align:right;${bold ? 'font-weight:700;font-size:15px;border-top:2px solid #333;' : 'color:#555;font-size:12px;'}">${label}</td>
       <td style="padding:4px 10px;text-align:right;width:130px;${bold ? 'font-weight:700;font-size:15px;border-top:2px solid #333;' : 'font-size:12px;'}">${esc(val)}</td>
     </tr>`).join('');

  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #333;padding-bottom:12px;">
    <div>
      <div style="font-size:22px;font-weight:800;letter-spacing:.02em;">${esc(b.businessName)}</div>
      ${b.addressLine ? `<div style="font-size:12px;color:#555;margin-top:3px;max-width:300px;">${esc(b.addressLine)}</div>` : ''}
    </div>
    <div style="text-align:right;font-size:11px;color:#555;line-height:1.5;">${headRight}</div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 10px;">
    <div style="font-size:16px;font-weight:700;letter-spacing:.08em;color:#333;">${opts.title}</div>
    <div style="font-size:12px;text-align:right;line-height:1.6;">${metaHTML}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:4px;">
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:10px;">
    <table style="border-collapse:collapse;min-width:280px;"><tbody>${totalsHTML}</tbody></table>
  </div>

  ${opts.note ? `<p style="font-size:11px;color:#c00;margin-top:16px;border-top:1px solid #eee;padding-top:8px;">${opts.note}</p>` : ''}
  ${opts.barcodeImg ? `<div style="text-align:center;margin-top:16px;"><img src="${opts.barcodeImg}" style="max-width:220px;" alt="barcode" /></div>` : ''}
  <div style="text-align:center;font-size:11px;color:#888;margin-top:18px;border-top:1px solid #eee;padding-top:10px;">${esc(opts.footer || '')}</div>
</div>`;
}

// Build a printable Credit Note body — always a full-page A4/A5 layout
// (formal GST document, not a thermal-roll receipt).
export function buildCreditNoteHTML(creditNote, business) {
  const b = { ...DEFAULT_BUSINESS, ...(business || {}) };
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
    totals: [
      ['Item Total', `₹${creditNote.items.reduce((s, it) => s + it.price * it.qty, 0).toFixed(2)}`, false],
      ...(creditNote.netPayableRatio != null && creditNote.netPayableRatio !== 1 ? [
        ['Bill Discount / Round-off Share', `${creditNote.netPayableRatio < 1 ? '-' : '+'}₹${Math.abs(creditNote.items.reduce((s, it) => s + it.price * it.qty, 0) - creditNote.creditNoteTotal).toFixed(2)}`, false],
      ] : []),
      ...(creditNote.gst?.enabled ? [
        ['Taxable Value', `₹${creditNote.taxableValue.toFixed(2)}`, false],
        [`CGST @ ${creditNote.gst.cgstPercent}%`, `₹${creditNote.cgstAmount.toFixed(2)}`, false],
        [`SGST @ ${creditNote.gst.sgstPercent}%`, `₹${creditNote.sgstAmount.toFixed(2)}`, false],
      ] : []),
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
  body { font-family: Arial, Helvetica, sans-serif; margin: 0 auto; width: 180mm; max-width: 100%; }
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
  body { font-family: ${paper.kind === 'sheet' ? 'Arial, Helvetica, sans-serif' : 'monospace'}; margin: 0 auto; padding: ${paper.kind === 'roll' ? '4px' : '0'}; width: ${paper.contentMm}mm; max-width: 100%; }
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

  const gst = computeGst(sale.totalAmount, b);
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
  if (sale.discountAmount > 0) lines.push(`*Bill Value: ₹${(sale.totalAmount + sale.discountAmount).toFixed(2)}*`);
  if (nonPointsDiscount > 0) lines.push(`Discount: -₹${nonPointsDiscount.toFixed(2)}`);
  if (gst) {
    lines.push(`Taxable: ₹${gst.net.toFixed(2)}`);
    lines.push(`CGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}: ₹${gst.cgst.toFixed(2)}`);
    lines.push(`SGST @ ${gst.halfRate}%${gst.inclusive ? ' (incl.)' : ''}: ₹${gst.sgst.toFixed(2)}`);
  }
  const grand = gst ? gst.grandTotal : sale.totalAmount;
  const carried = carriedSettlementOf(sale);
  const netPayable = grand + (carried?.amount || 0);
  if (carried) lines.push(`${carried.sourceLabel}: ${carried.amount > 0 ? '+' : '-'}₹${Math.abs(carried.amount).toFixed(2)}`);
  lines.push(`*${carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL'}: ₹${Math.abs(netPayable).toFixed(2)}*`);
  const splitPayments = sale.splitPayments || [];
  lines.push(`Payment: ${splitPayments.length ? splitPayments.map((p) => `${p.method} ₹${Number(p.amount).toFixed(2)}`).join(' + ') : sale.paymentMethod}`);
  if (extra.pointsRedeemed > 0) lines.push(`Points Redeemed: ${extra.pointsRedeemed} pts (-₹${pointsRedeemedValue.toFixed(2)})`);
  if (extra.pointsEarnedRedeemedNow > 0) lines.push(`Points Earned & Redeemed This Bill: +${extra.pointsEarnedRedeemedNow} pts (-₹${Number(extra.pointsEarnedRedeemedNow).toFixed(2)})`);
  else if (extra.pointsEarned > 0) lines.push(`Points Earned: +${extra.pointsEarned} pts`);
  if (extra.balancePoints != null) lines.push(`Balance Points: ${extra.balancePoints} pts`);
  lines.push('');
  lines.push(b.footerNote || 'Thank you for shopping with us!');

  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank');
}
