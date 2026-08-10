// Shared barcode-label helpers: size presets, barcode rendering, and
// printable-HTML generation. Used by Products, Purchase, and the
// settings-driven defaults. Single source of truth so every print path matches.

import JsBarcode from 'jsbarcode';

// Built-in label size presets (physical media). `a4sheet` is an office-printer
// sheet of gridded labels rather than a single-label roll.
export const LABEL_SIZES = [
  { id: '50x25',   label: '50 × 25 mm (2" × 1")',        w: 50,  h: 25,  desc: 'Small price tag' },
  { id: '57x32',   label: '57 × 32 mm (2.25" × 1.25")',  w: 57,  h: 32,  desc: 'Standard shelf label' },
  { id: '75x50',   label: '75 × 50 mm (3" × 2")',        w: 75,  h: 50,  desc: 'Medium label' },
  { id: '100x50',  label: '100 × 50 mm (4" × 2")',       w: 100, h: 50,  desc: 'Large label / Zebra ZD420' },
  { id: '100x150', label: '100 × 150 mm (4" × 6")',      w: 100, h: 150, desc: 'Shipping label' },
  { id: 'a4sheet', label: 'A4 Sheet (3 × 8 grid)',       w: 210, h: 297, desc: 'Sheet labels — office printer', sheet: true },
];

// Resolve the effective size {w,h,sheet,label} in mm from a sizeId + custom dims.
export function resolveLabelSize(sizeId, customWidthMm, customHeightMm) {
  if (sizeId === 'custom') {
    const w = Math.max(10, Number(customWidthMm) || 50);
    const h = Math.max(10, Number(customHeightMm) || 25);
    return { id: 'custom', w, h, sheet: false, label: `Custom ${w} × ${h} mm` };
  }
  return LABEL_SIZES.find((s) => s.id === sizeId) || LABEL_SIZES[0];
}

// A valid EAN-13 is 12–13 digits (JsBarcode computes/validates the checksum).
export function isValidEan13(code) {
  return /^\d{12,13}$/.test(String(code || ''));
}

// Render a barcode to a PNG data-URI. Falls back to CODE128 when EAN-13 is
// requested but the value isn't a valid 13-digit numeric code.
export function barcodeDataURL(code, symbology = 'CODE128', displayValue = true) {
  const canvas = document.createElement('canvas');
  const useEan = symbology === 'EAN13' && isValidEan13(code);
  const fmt = useEan ? 'EAN13' : 'CODE128';
  try {
    JsBarcode(canvas, String(code), {
      format: fmt, width: 2, height: 60, displayValue, fontSize: 14, margin: 6, background: '#ffffff',
    });
    return canvas.toDataURL('image/png');
  } catch {
    // Last-ditch fallback to CODE128 if EAN render threw for any reason.
    try {
      JsBarcode(canvas, String(code), { format: 'CODE128', width: 2, height: 60, displayValue, fontSize: 14, margin: 6, background: '#ffffff' });
      return canvas.toDataURL('image/png');
    } catch { return null; }
  }
}

// Build the inner HTML for one label given an item and content toggles.
// `item` fields: name, barcodeImg (data-uri), price, discountPrice, color, size, SKU.
// `content.company` toggles the shop name; the value comes from content.businessName.
function labelInnerHTML(item, content) {
  const showCompany = content.company && content.businessName;
  const showName = content.name && item.name;
  const showNumber = item.barcode;
  const showVariant = content.variant && item.color;
  const showSize = content.size && item.size;

  // Shop name — full-width bar at the very top
  const companyTag = showCompany
    ? `<div style="font-size:7pt;font-weight:700;text-align:center;width:100%;border-bottom:0.2mm solid #ccc;padding-bottom:0.5mm;margin-bottom:0.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${content.businessName}</div>`
    : '';

  // Product name (left) + barcode number (right)
  const nameTag = (showName || showNumber)
    ? `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:1mm;width:100%;margin-bottom:0.5mm;">
        <span style="font-size:6pt;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${showName ? item.name : ''}</span>
        <span style="font-size:5.5pt;color:#333;white-space:nowrap;flex-shrink:0;">${showNumber ? item.barcode : ''}</span>
      </div>`
    : '';

  const imgTag = item.barcodeImg
    ? `<img src="${item.barcodeImg}" style="max-width:100%;max-height:55%;object-fit:contain;" />`
    : '';

  const hasDiscount = item.discountPrice != null && item.discountPrice !== '' && Number(item.discountPrice) > 0;
  const price = item.price ?? item.costPrice;
  const priceTag = content.price && price != null && price !== ''
    ? (hasDiscount
        ? `<div style="font-size:5pt;color:#888;">MRP: <span style="text-decoration:line-through;">₹${Number(price).toFixed(2)}</span></div><div style="font-size:5pt;color:#555;">Discounted Price:</div><div style="font-size:8pt;font-weight:700;color:#c00;">₹${Number(item.discountPrice).toFixed(2)}</div>`
        : `<div style="font-size:5pt;color:#555;">MRP</div><div style="font-size:8pt;font-weight:700;">₹${Number(price).toFixed(2)}</div>`)
    : '';

  const variantSpan = showVariant
    ? `<div style="font-size:7pt;font-weight:700;color:#222;">${item.color}</div>`
    : '';
  const sizeSpan = showSize
    ? `<div style="font-size:9pt;font-weight:800;color:#111;text-align:right;">Size: ${item.size}</div>`
    : '';

  const skuTag = content.sku && item.SKU ? `<div style="font-size:5pt;color:#555;">SKU: ${item.SKU}</div>` : '';

  // Bottom row: price+variant on the left, size on the right
  const bottomRow = (priceTag || variantSpan || sizeSpan)
    ? `<div style="display:flex;flex-direction:row;align-items:flex-end;justify-content:space-between;width:100%;gap:1mm;margin-top:0.5mm;">
        <div style="display:flex;flex-direction:column;align-items:flex-start;">${variantSpan}${priceTag}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;">${sizeSpan}</div>
      </div>`
    : '';

  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;">
    ${companyTag}${nameTag}${imgTag}${skuTag}${bottomRow}
  </div>`;
}

// Generate the full <style> + <body content> for a label print job.
// opts: { size, layout ('1up'|'2up'), content }
// entries: flat array of label items (already expanded by quantity).
export function buildLabelsHTML(entries, opts) {
  const { size, layout, content } = opts;
  const inner = (item) => labelInnerHTML(item, content);

  if (size.sheet) {
    // A4 grid of fixed 63×34 cells (industry-standard 24-up sheet).
    const labelCSS = `
      @page { size: A4; margin: 8mm; }
      .sheet { display: flex; flex-wrap: wrap; gap: 2mm; }
      .label { width: 63mm; height: 34mm; box-sizing: border-box; border: 0.2mm solid #ccc; padding: 1.5mm;
        display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; page-break-inside: avoid; }`;
    const body = `<div class="sheet">${entries.map((e) => `<div class="label">${inner(e)}</div>`).join('')}</div>`;
    return { css: labelCSS, body };
  }

  if (layout === '2up') {
    // Two labels per physical row. Each printed page is one row of two cells,
    // each cell exactly the chosen label size; page is 2×width wide.
    const labelCSS = `
      @page { size: ${size.w * 2}mm ${size.h}mm; margin: 0; }
      body { margin: 0; padding: 0; }
      .row { display: flex; width: ${size.w * 2}mm; height: ${size.h}mm; page-break-after: always; }
      .label { width: ${size.w}mm; height: ${size.h}mm; box-sizing: border-box; padding: 1.5mm;
        display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }`;
    // Chunk entries into pairs.
    const rows = [];
    for (let i = 0; i < entries.length; i += 2) {
      const a = entries[i];
      const b = entries[i + 1];
      rows.push(
        `<div class="row"><div class="label">${inner(a)}</div><div class="label">${b ? inner(b) : ''}</div></div>`
      );
    }
    return { css: labelCSS, body: rows.join('') };
  }

  // Default: one label per page (roll printers).
  const labelCSS = `
    @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
    body { margin: 0; padding: 0; }
    .label { width: ${size.w}mm; height: ${size.h}mm; box-sizing: border-box; padding: 1.5mm;
      display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; overflow: hidden; }`;
  const body = entries.map((e) => `<div class="label">${inner(e)}</div>`).join('');
  return { css: labelCSS, body };
}

// Open a print window for the given expanded entries. Returns true on success.
// onError(msg) is called if the pop-up is blocked.
export function printLabels(entries, opts, onError) {
  if (!entries.length) { onError?.('No labels to print'); return false; }
  const { css, body } = buildLabelsHTML(entries, opts);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Barcode Labels</title>
<style>* { box-sizing: border-box; font-family: Arial, sans-serif; } ${css}
@media screen { body { background:#eee; } .label { background:#fff; } .row { margin:4px auto; } }
@media print { body { background:white; } }</style></head>
<body>${body}<script>window.onload=function(){window.print()};<\/script></body></html>`;

  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) { onError?.('Pop-up blocked. Please allow pop-ups for this site.'); return false; }
  win.document.write(html);
  win.document.close();
  return true;
}

export const DEFAULT_LABEL_PRINT = {
  sizeId: '50x25',
  customWidthMm: 50,
  customHeightMm: 25,
  layout: '1up',
  symbology: 'CODE128',
  content: { company: true, name: true, price: true, variant: true, size: true, sku: false },
  pricePrefix: 'MRP',
  discountPrefix: 'Offer Price',
  defaultCopies: 1,
};
