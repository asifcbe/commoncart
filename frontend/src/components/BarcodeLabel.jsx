import React, { useEffect, useState } from 'react';
import {
  barcodeDataURL, qrDataURL, peekQrDataURL, registerQrDraw, ALL_LABEL_FIELDS, FIELD_SIZE_SCALE,
  CODE_KEY, ZONES, resolveZoneLayout,
} from '../utils/barcodeLabel';

// The label is rendered as a 5-zone CSS grid (top / left+center+right / bottom)
// that mirrors the ZoneLayoutEditor, so dragging a field (or the barcode/QR)
// into a zone actually moves it on the printed label. Every placed field lives
// in exactly one zone's ordered list; `resolveZoneLayout(lbl)` turns the saved
// config into that map.
//
// `pixelRatio` (CommonCart-only, see pixelRatioForDpi in utils/barcodeLabel.js)
// renders the underlying bitmap at the target printer's real resolution
// instead of the browser's 96dpi default. The <img> is then pinned to
// `cssWidth` (the 1× size) with height:auto + maxWidth:100%, so on-page layout
// is unchanged — only sharper on real hardware.
export const BarcodeImage = ({ value, height = 70, fontSize = 13, barWidth = 1.5, pixelRatio = 1 }) => {
  const bc = barcodeDataURL(value, { height, fontSize, barWidth, pixelRatio });
  if (!bc) return <svg style={{ maxWidth: '100%', display: 'block' }} />;
  return (
    <img
      src={bc.src}
      alt={value}
      style={{ width: bc.cssWidth, height: 'auto', maxWidth: '100%', display: 'block' }}
    />
  );
};

export const QRImage = ({ value, size = 80, pixelRatio = 1 }) => {
  // Synchronous cache hit (e.g. pre-warmed before a print render) renders
  // immediately on first paint — no async gap for a print-window snapshot to
  // race against. A cache miss still falls back to the async effect.
  const [src, setSrc] = useState(() => peekQrDataURL(value, size, pixelRatio));
  useEffect(() => {
    let cancelled = false;
    if (!value) { setSrc(null); return; }
    const cached = peekQrDataURL(value, size, pixelRatio);
    if (cached) { setSrc(cached); return; }
    const draw = qrDataURL(value, size, pixelRatio).then((url) => { if (!cancelled) setSrc(url); }).catch(() => {});
    registerQrDraw(draw);
    return () => { cancelled = true; };
  }, [value, size, pixelRatio]);
  if (!src) return <canvas style={{ display: 'block' }} width={size} height={size} />;
  return <img src={src} alt={value} width={size} height={size} style={{ display: 'block' }} />;
};

// Renders one field's value (or null if that field has nothing to show for
// this item). `zoneKeys` is the ordered key list of the zone this field sits
// in — used only by the price fields to decide whether MRP + Sale Price draw
// as one combined row (same zone) or separately (different zones).
// `zoneAlign` is the zone's own alignment (from the label's global
// `contentAlign`) — the fallback for any field that hasn't set its own
// `fieldStyles[key].align` override.
function renderLabelField(key, { item, lbl, fontSize, smallFontSize, zoneKeys = [], zoneAlign = 'center' }) {
  const show = (k) => lbl?.[k] !== false;
  const fieldStyles = lbl?.fieldStyles || {};
  const fStyle = (k, baseFs) => {
    const s = fieldStyles[k] || {};
    const scale = FIELD_SIZE_SCALE[s.size] ?? 1.0;
    // Label text is always solid black — a faded/grey color prints as an
    // invisible dither on direct-thermal printers, and per-field/global color
    // pickers were a source of accidentally-grey labels. No override exists
    // anymore; every field renders #000000 regardless of saved config.
    return { fontSize: baseFs * scale, color: '#000000', textAlign: s.align || zoneAlign };
  };
  const fLabel = (k) => {
    const labels = lbl?.fieldLabels || {};
    return labels[k] !== undefined ? labels[k] : null;
  };

  switch (key) {
    case 'showBusinessName': {
      if (!show(key) || !item?._businessName) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 1px', fontWeight: 600, ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item._businessName}
        </p>
      );
    }
    case 'showItemName': {
      if (!show(key)) return null;
      const st = fStyle(key, fontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 1px', fontWeight: 700, lineHeight: 1.15, ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item?.name}
        </p>
      );
    }
    case 'showItemCode': {
      if (!show(key) || !item?.itemCode) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 1px', ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.itemCode}
        </p>
      );
    }
    case 'showCategory': {
      if (!show(key) || !item?.category) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 1px', ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.category}
        </p>
      );
    }
    case 'showSize': {
      if (!show(key) || !item?.size) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 1px', ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : 'Size: '}{item.size}
        </p>
      );
    }
    case 'showVariant': {
      if (!show(key) || !item?.variant) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 1px', ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.variant}
        </p>
      );
    }
    case 'showHsn': {
      if (!show(key) || !item?.hsnCode) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      const label = prefix != null ? prefix : 'HSN';
      return (
        <p key={key} style={{ margin: '0 0 1px', ...st }}>
          {label ? `${label}: ` : ''}{item.hsnCode}
        </p>
      );
    }
    case 'showMrp':
    case 'showSalePrice': {
      const hasMrp = show('showMrp') && item?.mrp && Number(item.mrp) > 0;
      const hasSalePrice = show('showSalePrice') && item?.salePrice != null && Number(item.salePrice) > 0;
      if (!hasMrp && !hasSalePrice) return null;

      // When MRP and Sale Price share a zone they draw as ONE combined row on
      // whichever key comes first in that zone; the other key draws nothing.
      // When they're in different zones, each key draws only its own value.
      const bothHere = zoneKeys.includes('showMrp') && zoneKeys.includes('showSalePrice');
      if (bothHere) {
        const firstKey = zoneKeys.indexOf('showMrp') <= zoneKeys.indexOf('showSalePrice') ? 'showMrp' : 'showSalePrice';
        if (key !== firstKey) return null;
      }
      let drawMrp = hasMrp && (bothHere || key === 'showMrp');
      let drawSp = hasSalePrice && (bothHere || key === 'showSalePrice');
      // No real discount (MRP === sale price): show just the struck MRP, not a
      // redundant identical bold price next to it.
      if (drawMrp && drawSp && Number(item.mrp) === Number(item.salePrice)) drawSp = false;
      if (!drawMrp && !drawSp) return null;

      const mrpSt = fStyle('showMrp', smallFontSize);
      const spSt = fStyle('showSalePrice', fontSize);
      const mrpPrefix = fLabel('showMrp');
      const spPrefix = fLabel('showSalePrice');
      // Solid black + solid strike line, no opacity — a faded (opacity 0.5)
      // grey prints as an invisible dither on direct-thermal printers.
      const mrpColor = mrpSt.color || '#000000';
      const priceAlign = (bothHere ? mrpSt.textAlign : (key === 'showMrp' ? mrpSt.textAlign : spSt.textAlign)) || zoneAlign;
      const priceJustify = priceAlign === 'left' ? 'flex-start' : priceAlign === 'right' ? 'flex-end' : 'center';
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 2, margin: '1px 0 0', justifyContent: priceJustify, width: '100%' }}>
          {drawMrp && (
            <span style={{
              fontSize: mrpSt.fontSize,
              color: mrpColor,
              textDecoration: 'line-through',
              textDecorationColor: mrpColor,
              textDecorationThickness: 'from-font',
            }}>
              {mrpPrefix != null ? (mrpPrefix ? `${mrpPrefix} ` : '') : 'MRP '}₹{Number(item.mrp).toLocaleString('en-IN')}
            </span>
          )}
          {drawSp && (
            <span style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: drawMrp ? spSt.fontSize * 1.05 : spSt.fontSize, color: spSt.color }}>
              {spPrefix != null ? (spPrefix ? `${spPrefix} ` : '') : ''}₹{Number(item.salePrice).toLocaleString('en-IN')}
            </span>
          )}
        </div>
      );
    }
    case 'showBarcodeNumber': {
      // The human-readable barcode value, as its own field — only drawn where
      // its chip is placed (any zone, like every other field), and only when
      // explicitly turned on. Distinct from JsBarcode's own baked-in number
      // under the bars (that one is part of the scannable image itself and
      // can't be repositioned).
      if (!show(key) || !item?.barcode) return null;
      const st = fStyle(key, smallFontSize);
      return (
        <p key={key} style={{ margin: '0 0 1px', fontFamily: 'monospace', ...st }}>
          {item.barcode}
        </p>
      );
    }
    case 'showExtraFields':
      return show(key) ? (
        (item?.barcodeExtraFields || []).filter((f) => f.label || f.value).map((f, i) => {
          const st = fStyle(key, smallFontSize);
          return (
            <p key={`extra-${i}`} style={{ margin: '0 0 1px', ...st }}>
              {f.label ? <strong>{f.label}: </strong> : ''}{f.value}
            </p>
          );
        })
      ) : null;
    default:
      return null;
  }
}

// One zone's content — every placed field (in order) plus the barcode/QR
// image wherever CODE_KEY sits in that zone's list.
//
// `top` / `bottom` span the full label width, so their fields lay out as a
// wrapping horizontal row (drop 2–3 fields → they share one line). The
// `left` / `center` / `right` columns stay vertical stacks. A zone that holds
// the barcode/QR always stacks vertically regardless (the code needs its own
// full-width line).
function ZoneContent({ keys, item, lbl, sizeConfig, mode, align, zoneKey }) {
  const { barcodeHeight, qrSize, barWidth, fontSize, smallFontSize, pixelRatio } = sizeConfig;
  const show = (k) => lbl?.[k] !== false;
  const qrValue = item?.barcode || item?.itemCode || item?.name || 'item';

  // Note: the human-readable barcode number is its own field
  // ('showBarcodeNumber', handled in renderLabelField) — it's rendered
  // wherever its chip is placed, not hardcoded here under the image. The
  // QR/barcode image itself may still carry its own baked-in text (QR never
  // does; CODE128 barcodes do, via JsBarcode's displayValue) independent of
  // this field.
  const codeEl = mode === 'qr' ? (
    <div key={CODE_KEY} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <QRImage value={qrValue} size={Math.round(qrSize)} pixelRatio={pixelRatio} />
    </div>
  ) : (
    (show('showBarcode') && item?.barcode) ? (
      <div key={CODE_KEY} style={{ flexShrink: 0, width: '100%' }}>
        <BarcodeImage value={item.barcode} height={barcodeHeight} fontSize={smallFontSize} barWidth={barWidth} pixelRatio={pixelRatio} />
      </div>
    ) : null
  );

  const nodes = keys.map((k) => (k === CODE_KEY ? codeEl : renderLabelField(k, { item, lbl, fontSize, smallFontSize, zoneKeys: keys, zoneAlign: align })));
  if (!nodes.some(Boolean)) return null;

  const hasCode = keys.includes(CODE_KEY);
  const horizontal = (zoneKey === 'top' || zoneKey === 'bottom') && !hasCode;
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  // Per-field alignment override — a field's own fieldStyles[key].align (set
  // in the zone editor's field style panel) wins over the zone's alignment
  // for that field's BLOCK position, not just its text wrapping. CODE_KEY has
  // no override (the barcode/QR image is always zone-aligned).
  const alignOf = (k) => (k === CODE_KEY ? align : ((lbl?.fieldStyles || {})[k]?.align || align));
  const justifyOf = (a) => (a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center');

  if (horizontal) {
    const visible = nodes.filter(Boolean);
    return (
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
        justifyContent: justify, columnGap: 6, rowGap: 1,
        width: '100%', textAlign: align, fontFamily: 'Arial, sans-serif', minWidth: 0,
      }}>
        {visible.map((n, i) => (
          // Each field shares the row (flex: 0 1 auto) and wraps inside its own
          // box rather than forcing a full-width line — so 2–3 fields sit on
          // one line even when one of them (e.g. Item Name) is long.
          <div key={i} style={{
            flex: visible.length > 1 ? '1 1 auto' : '0 1 auto',
            minWidth: 0, maxWidth: '100%', wordBreak: 'break-word',
          }}>
            {n}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: justify, textAlign: align, fontFamily: 'Arial, sans-serif', minWidth: 0 }}>
      {keys.map((k, i) => (nodes[i] == null ? null : (
        <div key={k} style={{ alignSelf: justifyOf(alignOf(k)), maxWidth: '100%' }}>{nodes[i]}</div>
      )))}
    </div>
  );
}

/* ── Generic label rendered as a 5-zone grid (top / left / center / right / bottom) ── */
export const UnifiedLabel = ({ item, sizeConfig, lbl, mode = 'barcode' }) => {
  const { width, height, key: sizeKey } = sizeConfig;
  const align = lbl?.contentAlign || 'center';
  const bgColor = lbl?.backgroundColor || '#ffffff';
  const borderStyle = lbl?.borderStyle || 'solid';
  const isA4 = sizeKey === 'a4';
  const zoneLayout = resolveZoneLayout(lbl);

  const outerStyle = {
    width, height: height || 'auto',
    padding: isA4 ? '12px 14px' : '1px 2px',
    fontFamily: 'Arial, sans-serif',
    overflow: 'hidden',
    display: 'grid',
    gridTemplateAreas: '"top top top" "left center right" "bottom bottom bottom"',
    // Rows sized to content (not '1fr') so the middle row doesn't balloon and
    // push the barcode/QR away from the top/bottom text; the whole block is
    // then centred vertically as one unit. No gaps between zones — every mm of
    // a small label counts (esp. QR).
    gridTemplateRows: 'auto auto auto',
    gridTemplateColumns: 'auto 1fr auto',
    rowGap: 0, columnGap: 0,
    alignContent: 'center',
    boxSizing: 'border-box',
    backgroundColor: bgColor,
    border: isA4 ? 'none' : (borderStyle === 'none' ? 'none' : `0.5px ${borderStyle} #ccc`),
  };

  return (
    <div style={outerStyle}>
      {ZONES.map((z) => (
        <div key={z.key} style={{ gridArea: z.key, display: 'flex', justifyContent: z.key === 'left' ? 'flex-start' : z.key === 'right' ? 'flex-end' : 'center', alignItems: 'center' }}>
          <ZoneContent keys={zoneLayout[z.key]} item={item} lbl={lbl} sizeConfig={sizeConfig} mode={mode} align={align} zoneKey={z.key} />
        </div>
      ))}
    </div>
  );
};

export const QRLabel = ({ item, sizeConfig, lbl }) => <UnifiedLabel item={item} sizeConfig={sizeConfig} lbl={lbl} mode="qr" />;
export const BarcodeLabel = ({ item, sizeConfig, lbl, mode }) => <UnifiedLabel item={item} sizeConfig={sizeConfig} lbl={lbl} mode={mode || 'barcode'} />;

// Renders all selected items (each with individual copies) on one printable
// sheet. forwardRef so react-to-print (used by BarcodeLabelPrintDialog.jsx)
// can print this exact, already-mounted node directly.
//
// A4: labels flow down one A4 grid.
// Roll / label printers: `@page` is sized to a single row of `columns` labels,
// so every row of labels MUST be its own page — a plain grid taller than one
// label just gets clipped at the page boundary and the rest never prints
// (this is why "4 labels → only 2 print"). Each row div is therefore an
// explicit page break, exactly one label tall, with no sheet padding/gap so
// it aligns to the page edges.
export const BulkLabelSheet = React.forwardRef(({ entries, sizeConfig, lbl, columns = 1, mode = 'barcode' }, ref) => {
  const isA4 = sizeConfig.key === 'a4';
  const LabelComp = mode === 'qr' ? QRLabel : BarcodeLabel;
  const cols = Math.max(1, Number(columns) || 1);

  // Flatten every (item, copies) pair into one entry per physical label.
  const flat = [];
  (entries || []).forEach(({ item, copies }) => {
    const n = Math.max(0, Math.floor(Number(copies) || 0));
    for (let i = 0; i < n; i++) flat.push({ item, i });
  });

  if (isA4) {
    return (
      <div ref={ref} style={{
        padding: 6, backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${sizeConfig.width})`,
        gap: 2, width: '210mm',
      }}>
        {flat.map(({ item, i }, idx) => (
          <LabelComp key={`${item.id}-${i}-${idx}`} item={item} sizeConfig={sizeConfig} lbl={lbl} />
        ))}
      </div>
    );
  }

  const rows = [];
  for (let r = 0; r < flat.length; r += cols) rows.push(flat.slice(r, r + cols));
  const rowWidthMm = (parseFloat(sizeConfig.width) || 80) * cols;

  return (
    <div ref={ref} style={{ backgroundColor: '#fff', fontFamily: 'Arial, sans-serif' }}>
      {rows.map((row, r) => (
        <div key={r} style={{
          display: 'flex',
          width: `${rowWidthMm}mm`,
          height: sizeConfig.height || 'auto',
          overflow: 'hidden',
          breakInside: 'avoid',
          pageBreakInside: 'avoid',
          breakAfter: r < rows.length - 1 ? 'page' : 'auto',
          pageBreakAfter: r < rows.length - 1 ? 'always' : 'auto',
        }}>
          {row.map(({ item, i }, c) => (
            <LabelComp key={`${item.id}-${i}-${c}`} item={item} sizeConfig={sizeConfig} lbl={lbl} />
          ))}
        </div>
      ))}
    </div>
  );
});
BulkLabelSheet.displayName = 'BulkLabelSheet';

export { ALL_LABEL_FIELDS };
