// Export helpers for bills/purchases → PDF, PNG image, and Excel.
// Heavy libs (jspdf, html2canvas, xlsx) are dynamically imported so they're
// only fetched when the user actually exports something.

import { buildBillBodyHTML, resolveBillPaper, computeItemizedGst, scaleItemsToGoodsAmount, invoiceLayout, buildCreditNoteHTML, buildReplacementNoteHTML, carriedSettlementOf } from './bill';
import { formatDateTime } from './date';

// Credit Notes / Replacement Notes are always full-page documents — fixed A4
// content width, independent of the shop's thermal-receipt billConfig.
const DOCUMENT_CONTENT_MM = 180;

// Render an HTML string into a detached, off-screen node sized to `widthMm`,
// rasterize it with html2canvas, and hand the canvas to `cb`. Cleans up after.
async function renderToCanvas(bodyHTML, widthMm, kind = 'roll') {
  const { default: html2canvas } = await import('html2canvas');
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-10000px';
  holder.style.top = '0';
  holder.style.background = '#ffffff';
  holder.style.padding = kind === 'sheet' ? '0' : '8px';
  holder.style.width = `${widthMm}mm`;
  holder.style.fontFamily = kind === 'sheet' ? 'Arial, Helvetica, sans-serif' : 'monospace';
  holder.innerHTML = bodyHTML;
  document.body.appendChild(holder);
  try {
    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff' });
    return canvas;
  } finally {
    document.body.removeChild(holder);
  }
}

function triggerDownload(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Sales bill exports ──────────────────────────────────────

export async function exportSaleImage(sale, business, billConfig, extra = {}) {
  const paper = resolveBillPaper(billConfig);
  const canvas = await renderToCanvas(buildBillBodyHTML(sale, business, paper.kind, extra), paper.contentMm, paper.kind);
  triggerDownload(canvas.toDataURL('image/png'), `bill-${sale.transactionId}.png`);
}

export async function exportSalePDF(sale, business, billConfig, extra = {}) {
  const { jsPDF } = await import('jspdf');
  const paper = resolveBillPaper(billConfig);
  const canvas = await renderToCanvas(buildBillBodyHTML(sale, business, paper.kind, extra), paper.contentMm, paper.kind);
  const img = canvas.toDataURL('image/png');
  const pxToMm = paper.contentMm / canvas.width;
  const imgHmm = canvas.height * pxToMm;

  let pdf, x, y, w, h;
  if (paper.kind === 'sheet') {
    pdf = new jsPDF({ unit: 'mm', format: paper.widthMm === 210 ? 'a4' : 'a5', orientation: 'portrait' });
    const margin = 12;
    w = paper.contentMm;
    h = imgHmm;
    x = margin; y = margin;
  } else {
    // Roll: page is exactly the receipt size.
    pdf = new jsPDF({ unit: 'mm', format: [paper.widthMm, imgHmm + 8], orientation: 'portrait' });
    w = paper.contentMm; h = imgHmm; x = (paper.widthMm - w) / 2; y = 4;
  }
  pdf.addImage(img, 'PNG', x, y, w, h);
  pdf.save(`bill-${sale.transactionId}.pdf`);
}

// Sheet rows (AoA) for one sale bill — reused by single + bulk Excel export.
function saleSheetRows(sale, business) {
  const b = { businessName: 'CommonCart Store', ...(business || {}) };
  // sale.totalAmount has round-off baked into it at checkout — back it back
  // out so GST is computed on the goods-only amount, matching bill.js.
  const roundOffAmount = sale.roundOffAmount || 0;
  const goodsAmount = sale.totalAmount - roundOffAmount;
  const scaledItems = scaleItemsToGoodsAmount(sale.items, goodsAmount);
  const gst = computeItemizedGst(scaledItems, b, sale.gst);
  const hsnRows = gst ? gst.rows : null;
  const anyHsn = sale.items.some((it) => it.hsnCode);
  const rows = [];
  rows.push([b.businessName]);
  if (b.addressLine) rows.push([b.addressLine]);
  if (b.gstin) rows.push([`GSTIN: ${b.gstin}`]);
  rows.push([`Bill No: ${sale.transactionId}`, '', `Date: ${formatDateTime(sale.createdAt)}`]);
  rows.push([]);
  rows.push(anyHsn ? ['#', 'Item', 'HSN', 'Qty', 'Unit Price', 'Amount'] : ['#', 'Item', 'Qty', 'Unit Price', 'Amount']);
  sale.items.forEach((it, i) => rows.push(
    anyHsn
      ? [i + 1, it.name + (it.isDiscounted ? ' (Discounted)' : ''), it.hsnCode || '', it.qty, it.price, it.price * it.qty]
      : [i + 1, it.name + (it.isDiscounted ? ' (Discounted)' : ''), it.qty, it.price, it.price * it.qty]
  ));
  rows.push([]);
  if (sale.discountAmount > 0) rows.push(['', '', '', 'Discount', -sale.discountAmount]);
  if (roundOffAmount !== 0) rows.push(['', '', '', 'Round Off', roundOffAmount]);
  // Numeric cells (not pre-formatted strings) so the sheet stays spreadsheet-
  // friendly, same as every other amount column here — mirrors
  // gstTotalsRows' distinctRates branch without its string formatting.
  if (gst) {
    if (gst.distinctRates <= 1) {
      rows.push(['', '', '', 'Taxable', gst.net]);
      rows.push(['', '', '', `CGST @ ${gst.halfRate}%`, gst.cgst]);
      rows.push(['', '', '', `SGST @ ${gst.halfRate}%`, gst.sgst]);
    } else {
      const byRate = new Map();
      for (const r of gst.rows) {
        const g = byRate.get(r.rate) || { rate: r.rate, halfRate: r.halfRate, taxableValue: 0, cgst: 0, sgst: 0 };
        g.taxableValue += r.taxableValue; g.cgst += r.cgst; g.sgst += r.sgst;
        byRate.set(r.rate, g);
      }
      for (const g of [...byRate.values()].sort((a, b2) => a.rate - b2.rate)) {
        rows.push(['', '', '', `Taxable @ ${g.rate}%`, g.taxableValue]);
        rows.push(['', '', '', `CGST @ ${g.halfRate}%`, g.cgst]);
        rows.push(['', '', '', `SGST @ ${g.halfRate}%`, g.sgst]);
      }
    }
  }
  const grand = gst ? gst.grandTotal : goodsAmount;
  const carried = carriedSettlementOf(sale);
  const netPayable = grand + roundOffAmount + (carried?.amount || 0);
  if (carried) rows.push(['', '', '', carried.sourceLabel, carried.amount]);
  rows.push(['', '', '', carried ? (netPayable < 0 ? 'REFUND DUE' : 'NET PAYABLE') : 'TOTAL', netPayable]);
  rows.push(['', '', '', 'Payment', sale.paymentMethod]);
  // HSN Summary sits below the total, matching every other bill surface.
  if (hsnRows && hsnRows.length) {
    rows.push([]);
    rows.push(['HSN Summary']);
    rows.push(['HSN Code', 'Rate', '', 'Taxable Value', 'CGST', 'SGST']);
    hsnRows.forEach((r) => rows.push([r.hsnCode || '', `${r.rate}%`, '', r.taxableValue, r.cgst, r.sgst]));
  }
  return rows;
}
const SALE_COLS = [{ wch: 4 }, { wch: 34 }, { wch: 6 }, { wch: 12 }, { wch: 12 }];

export async function exportSaleExcel(sale, business) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(saleSheetRows(sale, business));
  ws['!cols'] = SALE_COLS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bill');
  XLSX.writeFile(wb, `bill-${sale.transactionId}.xlsx`);
}

// ─── Purchase bill exports ───────────────────────────────────

// Build the inner HTML for a purchase bill. `kind` selects receipt vs. invoice.
export function buildPurchaseBodyHTML(purchase, business, kind = 'roll') {
  const b = { businessName: 'CommonCart Store', addressLine: '', gstin: '', footerNote: '', ...(business || {}) };
  const supplier = purchase.supplier || (purchase.supplierId && purchase.supplierId.name) || '—';

  if (kind === 'sheet') return invoiceLayout({
    title: 'PURCHASE BILL',
    business: b,
    meta: [
      ['Purchase ID', purchase.purchaseId],
      ['Date', formatDateTime(purchase.purchaseDate || purchase.createdAt)],
      ['Supplier', supplier],
    ],
    columns: ['#', 'Item', 'Variant', 'Size', 'Qty', 'Cost', 'Amount'],
    align: ['left', 'left', 'left', 'left', 'right', 'right', 'right'],
    rows: purchase.items.map((it, i) => [
      i + 1, it.name, it.color || '—', it.size || '—', it.qty,
      `₹${Number(it.costPrice).toFixed(2)}`, `₹${(it.costPrice * it.qty).toFixed(2)}`,
    ]),
    totals: [['TOTAL COST', `₹${Number(purchase.totalCost).toFixed(2)}`, true]],
    footer: b.footerNote || '',
  });

  // ── Thermal receipt (roll) ──
  const itemsHTML = purchase.items.map((it) => {
    const variant = [it.color, it.size].filter(Boolean).join(' / ');
    return `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0;">
      <span>${it.name}${variant ? ` <span style="color:#888;font-size:10px;">(${variant})</span>` : ''} x${it.qty}</span>
      <span>₹${(it.costPrice * it.qty).toFixed(2)}</span>
    </div>`;
  }).join('');

  const header = [
    `<strong style="font-size:16px;">${b.businessName}</strong>`,
    b.addressLine ? `<span style="font-size:10px;">${b.addressLine}</span>` : '',
    b.gstin ? `<span style="font-size:10px;">GSTIN: ${b.gstin}</span>` : '',
  ].filter(Boolean).join('<br/>');

  return `
<div style="text-align:center;border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px;">
  ${header}<br/>
  <span style="font-size:12px;font-weight:600;">PURCHASE BILL</span><br/>
  <span style="font-size:11px;">${formatDateTime(purchase.purchaseDate || purchase.createdAt)}</span><br/>
  <span style="font-size:10px;">Purchase ID: ${purchase.purchaseId}</span><br/>
  <span style="font-size:10px;">Supplier: ${supplier}</span>
</div>
${itemsHTML}
<div style="border-top:1px dashed #ccc;margin-top:6px;padding-top:6px;">
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>TOTAL COST</span><span>₹${Number(purchase.totalCost).toFixed(2)}</span></div>
</div>
${b.footerNote ? `<div style="text-align:center;font-size:10px;color:#888;margin-top:8px;white-space:pre-line;">${b.footerNote}</div>` : ''}`;
}

export function printPurchaseHTML(purchase, business, billConfig) {
  const paper = resolveBillPaper(billConfig);
  const body = buildPurchaseBodyHTML(purchase, business, paper.kind);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Purchase ${purchase.purchaseId}</title>
<style>@page { ${paper.page} } body { font-family: ${paper.kind === 'sheet' ? 'Arial, Helvetica, sans-serif' : 'monospace'}; margin: 0 auto; padding: ${paper.kind === 'roll' ? '4px' : '0'}; width: ${paper.contentMm}mm; max-width: 100%; }</style>
</head><body>${body}<script>window.onload=function(){window.print()};<\/script></body></html>`;
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) { alert('Pop-up blocked — allow pop-ups for this site.'); return; }
  win.document.write(html); win.document.close();
}

export async function exportPurchaseImage(purchase, business, billConfig) {
  const paper = resolveBillPaper(billConfig);
  const canvas = await renderToCanvas(buildPurchaseBodyHTML(purchase, business, paper.kind), paper.contentMm, paper.kind);
  triggerDownload(canvas.toDataURL('image/png'), `purchase-${purchase.purchaseId}.png`);
}

export async function exportPurchasePDF(purchase, business, billConfig) {
  const { jsPDF } = await import('jspdf');
  const paper = resolveBillPaper(billConfig);
  const canvas = await renderToCanvas(buildPurchaseBodyHTML(purchase, business, paper.kind), paper.contentMm, paper.kind);
  const img = canvas.toDataURL('image/png');
  const pxToMm = paper.contentMm / canvas.width;
  const imgHmm = canvas.height * pxToMm;

  let pdf, x, y, w, h;
  if (paper.kind === 'sheet') {
    pdf = new jsPDF({ unit: 'mm', format: paper.widthMm === 210 ? 'a4' : 'a5', orientation: 'portrait' });
    w = paper.contentMm; h = imgHmm; x = 12; y = 12;
  } else {
    pdf = new jsPDF({ unit: 'mm', format: [paper.widthMm, imgHmm + 8], orientation: 'portrait' });
    w = paper.contentMm; h = imgHmm; x = (paper.widthMm - w) / 2; y = 4;
  }
  pdf.addImage(img, 'PNG', x, y, w, h);
  pdf.save(`purchase-${purchase.purchaseId}.pdf`);
}

function purchaseSheetRows(purchase, business) {
  const b = { businessName: 'CommonCart Store', ...(business || {}) };
  const rows = [];
  rows.push([b.businessName]);
  rows.push(['PURCHASE BILL']);
  rows.push([`Purchase ID: ${purchase.purchaseId}`, '', `Date: ${formatDateTime(purchase.purchaseDate || purchase.createdAt)}`]);
  rows.push([`Supplier: ${purchase.supplier || (purchase.supplierId && purchase.supplierId.name) || '—'}`]);
  rows.push([]);
  rows.push(['#', 'Item', 'Variant', 'Size', 'Qty', 'Cost/Unit', 'Amount']);
  purchase.items.forEach((it, i) => rows.push([i + 1, it.name, it.color || '', it.size || '', it.qty, it.costPrice, it.costPrice * it.qty]));
  rows.push([]);
  rows.push(['', '', '', '', '', 'TOTAL', Number(purchase.totalCost)]);
  return rows;
}
const PURCHASE_COLS = [{ wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 12 }];

export async function exportPurchaseExcel(purchase, business) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(purchaseSheetRows(purchase, business));
  ws['!cols'] = PURCHASE_COLS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Purchase');
  XLSX.writeFile(wb, `purchase-${purchase.purchaseId}.xlsx`);
}

// ─── Credit Note / Replacement Note exports ──────────────────
// Always full-page (A4-shaped) — these are formal GST documents, not
// thermal-roll receipts, so they don't take a billConfig paper size.

export async function exportCreditNoteImage(creditNote, business) {
  const canvas = await renderToCanvas(buildCreditNoteHTML(creditNote, business), DOCUMENT_CONTENT_MM, 'sheet');
  triggerDownload(canvas.toDataURL('image/png'), `credit-note-${creditNote.creditNoteNumber}.png`);
}

export async function exportCreditNotePDF(creditNote, business) {
  const { jsPDF } = await import('jspdf');
  const canvas = await renderToCanvas(buildCreditNoteHTML(creditNote, business), DOCUMENT_CONTENT_MM, 'sheet');
  const img = canvas.toDataURL('image/png');
  const imgHmm = canvas.height * (DOCUMENT_CONTENT_MM / canvas.width);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pdf.addImage(img, 'PNG', 12, 12, DOCUMENT_CONTENT_MM, imgHmm);
  pdf.save(`credit-note-${creditNote.creditNoteNumber}.pdf`);
}

function creditNoteSheetRows(creditNote, business) {
  const b = { businessName: 'CommonCart Store', ...(business || {}) };
  const rows = [];
  rows.push([b.businessName]);
  rows.push(['CREDIT NOTE']);
  rows.push([`Credit Note No: ${creditNote.creditNoteNumber}`, '', `Date: ${formatDateTime(creditNote.createdAt)}`]);
  rows.push([`Against Invoice: ${creditNote.originalTransactionId}`]);
  rows.push([]);
  rows.push(['#', 'Item', 'Qty', 'Rate', 'Amount', 'Type']);
  creditNote.items.forEach((it, i) => rows.push([i + 1, it.name, it.qty, it.price, it.price * it.qty, it.lineType === 'EXCHANGE_OUT' ? 'Exchanged' : 'Returned']));
  rows.push([]);
  const itemTotal = creditNote.items.reduce((s, it) => s + it.price * it.qty, 0);
  rows.push(['', '', '', '', 'Item Total', itemTotal]);
  if (creditNote.netPayableRatio != null && creditNote.netPayableRatio !== 1) {
    rows.push(['', '', '', '', 'Bill Discount / Round-off Share', creditNote.creditNoteTotal - itemTotal]);
  }
  if (creditNote.gst?.enabled) {
    rows.push(['', '', '', '', 'Taxable Value', creditNote.taxableValue]);
    rows.push(['', '', '', '', `CGST @ ${creditNote.gst.cgstPercent}%`, creditNote.cgstAmount]);
    rows.push(['', '', '', '', `SGST @ ${creditNote.gst.sgstPercent}%`, creditNote.sgstAmount]);
  }
  rows.push(['', '', '', '', 'CREDIT TOTAL', creditNote.creditNoteTotal]);
  return rows;
}
const CREDIT_NOTE_COLS = [{ wch: 4 }, { wch: 34 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];

export async function exportCreditNoteExcel(creditNote, business) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(creditNoteSheetRows(creditNote, business));
  ws['!cols'] = CREDIT_NOTE_COLS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Credit Note');
  XLSX.writeFile(wb, `credit-note-${creditNote.creditNoteNumber}.xlsx`);
}

export async function exportReplacementNoteImage(note, business) {
  const canvas = await renderToCanvas(buildReplacementNoteHTML(note, business), DOCUMENT_CONTENT_MM, 'sheet');
  triggerDownload(canvas.toDataURL('image/png'), `replacement-note-${note.replacementNumber}.png`);
}

export async function exportReplacementNotePDF(note, business) {
  const { jsPDF } = await import('jspdf');
  const canvas = await renderToCanvas(buildReplacementNoteHTML(note, business), DOCUMENT_CONTENT_MM, 'sheet');
  const img = canvas.toDataURL('image/png');
  const imgHmm = canvas.height * (DOCUMENT_CONTENT_MM / canvas.width);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pdf.addImage(img, 'PNG', 12, 12, DOCUMENT_CONTENT_MM, imgHmm);
  pdf.save(`replacement-note-${note.replacementNumber}.pdf`);
}

export async function exportReplacementNoteExcel(note, business) {
  const XLSX = await import('xlsx');
  const b = { businessName: 'CommonCart Store', ...(business || {}) };
  const rows = [
    [b.businessName], ['REPLACEMENT NOTE'],
    [`Replacement No: ${note.replacementNumber}`, '', `Date: ${formatDateTime(note.createdAt)}`],
    [`Against Invoice: ${note.originalTransactionId}`], [],
    ['#', 'Item', 'Qty'],
    ...note.items.map((it, i) => [i + 1, it.name, it.qty]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 4 }, { wch: 34 }, { wch: 6 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Replacement Note');
  XLSX.writeFile(wb, `replacement-note-${note.replacementNumber}.xlsx`);
}

// ─── Bulk (multi-select) exports ─────────────────────────────
// `records` is an array of full sale/purchase objects.

// Render each record's body to a canvas, then place one per page in a PDF.
async function bulkPDF(records, buildBody, billConfig, idOf, filename) {
  const { jsPDF } = await import('jspdf');
  const paper = resolveBillPaper(billConfig);
  let pdf = null;
  for (const rec of records) {
    const canvas = await renderToCanvas(buildBody(rec, paper.kind), paper.contentMm, paper.kind);
    const img = canvas.toDataURL('image/png');
    const imgHmm = canvas.height * (paper.contentMm / canvas.width);
    if (paper.kind === 'sheet') {
      const fmt = paper.widthMm === 210 ? 'a4' : 'a5';
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: fmt, orientation: 'portrait' });
      else pdf.addPage(fmt, 'portrait');
      pdf.addImage(img, 'PNG', 12, 12, paper.contentMm, imgHmm);
    } else {
      const pageFmt = [paper.widthMm, imgHmm + 8];
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: pageFmt, orientation: 'portrait' });
      else pdf.addPage(pageFmt, 'portrait');
      pdf.addImage(img, 'PNG', (paper.widthMm - paper.contentMm) / 2, 4, paper.contentMm, imgHmm);
    }
  }
  if (pdf) pdf.save(filename);
}

async function bulkExcel(records, rowsOf, business, cols, sheetName, idOf, filename) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  records.forEach((rec) => {
    const ws = XLSX.utils.aoa_to_sheet(rowsOf(rec, business));
    ws['!cols'] = cols;
    // Sheet names: <=31 chars, unique, no special chars.
    let name = String(idOf(rec)).replace(/[\\/?*[\]:]/g, '').slice(0, 28) || sheetName;
    let n = name; let i = 1;
    while (used.has(n)) n = `${name.slice(0, 25)}_${i++}`;
    used.add(n);
    XLSX.utils.book_append_sheet(wb, ws, n);
  });
  XLSX.writeFile(wb, filename);
}

async function bulkImageZip(records, buildBody, billConfig, idOf, filename, prefix) {
  const { default: JSZip } = await import('jszip');
  const paper = resolveBillPaper(billConfig);
  const zip = new JSZip();
  for (const rec of records) {
    const canvas = await renderToCanvas(buildBody(rec, paper.kind), paper.contentMm, paper.kind);
    const dataUrl = canvas.toDataURL('image/png');
    zip.file(`${prefix}-${idOf(rec)}.png`, dataUrl.split(',')[1], { base64: true });
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, filename);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportSalesBulk(sales, business, billConfig, kind) {
  const body = (s, k) => buildBillBodyHTML(s, business, k);
  if (kind === 'pdf') return bulkPDF(sales, body, billConfig, (s) => s.transactionId, `bills-${stamp()}.pdf`);
  if (kind === 'image') return bulkImageZip(sales, body, billConfig, (s) => s.transactionId, `bills-${stamp()}.zip`, 'bill');
  return bulkExcel(sales, saleSheetRows, business, SALE_COLS, 'Bill', (s) => s.transactionId, `bills-${stamp()}.xlsx`);
}

export async function exportPurchasesBulk(purchases, business, billConfig, kind) {
  const body = (p, k) => buildPurchaseBodyHTML(p, business, k);
  if (kind === 'pdf') return bulkPDF(purchases, body, billConfig, (p) => p.purchaseId, `purchases-${stamp()}.pdf`);
  if (kind === 'image') return bulkImageZip(purchases, body, billConfig, (p) => p.purchaseId, `purchases-${stamp()}.zip`, 'purchase');
  return bulkExcel(purchases, purchaseSheetRows, business, PURCHASE_COLS, 'Purchase', (p) => p.purchaseId, `purchases-${stamp()}.xlsx`);
}
