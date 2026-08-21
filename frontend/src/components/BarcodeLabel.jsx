import React, { useEffect, useState } from 'react';
import {
  barcodeDataURL, qrDataURL, peekQrDataURL, registerQrDraw, ALL_LABEL_FIELDS, FIELD_SIZE_SCALE,
  CODE_KEY, ZONES, resolveZoneLayout,
} from '../utils/barcodeLabel';

// Ported 1:1 from DigitZebra's Items.jsx label components (BarcodeImage,
// QRImage, LabelContent, UnifiedLabel) so both apps render identical labels.
// `item` fields expected: name, itemCode, barcode, category, size, variant,
// hsnCode, mrp, salePrice, _businessName, barcodeExtraFields.

export const BarcodeImage = ({ value, height = 70, fontSize = 13, barWidth = 1.5 }) => {
  const src = barcodeDataURL(value, { height, fontSize, barWidth });
  if (!src) return <svg style={{ maxWidth: '100%', display: 'block' }} />;
  return <img src={src} alt={value} style={{ maxWidth: '100%', display: 'block' }} />;
};

export const QRImage = ({ value, size = 80 }) => {
  // Synchronous cache hit (e.g. pre-warmed before a print render) renders
  // immediately on first paint — no async gap for a print-window snapshot
  // to race against. A cache miss still falls back to the async effect.
  const [src, setSrc] = useState(() => peekQrDataURL(value, size));
  useEffect(() => {
    let cancelled = false;
    if (!value) { setSrc(null); return; }
    const cached = peekQrDataURL(value, size);
    if (cached) { setSrc(cached); return; }
    const draw = qrDataURL(value, size).then((url) => { if (!cancelled) setSrc(url); }).catch(() => {});
    registerQrDraw(draw);
    return () => { cancelled = true; };
  }, [value, size]);
  if (!src) return <canvas style={{ display: 'block' }} width={size} height={size} />;
  return <img src={src} alt={value} width={size} height={size} style={{ display: 'block' }} />;
};

// Renders one field's value (or null if that field has nothing to show for
// this item). Shared by the zone grid (BarcodeLabel.jsx) and the settings
// panel's live per-field preview.
function renderLabelField(key, { item, lbl, fontSize, smallFontSize }) {
  const show = (k) => lbl?.[k] !== false;
  const globalTextColor = lbl?.textColor || '#000000';
  const fieldStyles = lbl?.fieldStyles || {};
  const fStyle = (k, baseFs) => {
    const s = fieldStyles[k] || {};
    const scale = FIELD_SIZE_SCALE[s.size] ?? 1.0;
    return { fontSize: baseFs * scale, color: s.color || globalTextColor };
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
        <p key={key} style={{ margin: '0 0 2px', fontWeight: 700, lineHeight: 1.2, ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item?.name}
        </p>
      );
    }
    case 'showItemCode': {
      if (!show(key) || !item?.itemCode) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 2px', opacity: 0.7, ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.itemCode}
        </p>
      );
    }
    case 'showCategory': {
      if (!show(key) || !item?.category) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 2px', opacity: 0.75, ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.category}
        </p>
      );
    }
    case 'showSize': {
      if (!show(key) || !item?.size) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 2px', opacity: 0.75, ...st }}>
          {prefix != null ? (prefix ? `${prefix}: ` : '') : 'Size: '}{item.size}
        </p>
      );
    }
    case 'showVariant': {
      if (!show(key) || !item?.variant) return null;
      const st = fStyle(key, smallFontSize);
      const prefix = fLabel(key);
      return (
        <p key={key} style={{ margin: '0 0 2px', opacity: 0.75, ...st }}>
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
        <p key={key} style={{ margin: '0 0 2px', opacity: 0.6, ...st }}>
          {label ? `${label}: ` : ''}{item.hsnCode}
        </p>
      );
    }
    case 'showMrp':
    case 'showSalePrice': {
      const hasMrp = show('showMrp') && item?.mrp && Number(item.mrp) > 0;
      const hasSalePrice = show('showSalePrice') && item?.salePrice != null && Number(item.salePrice) > 0;
      // Both prices render together as one combined field the first time
      // either is encountered in a zone; the other's own slot renders nothing
      // so a zone containing both showMrp and showSalePrice doesn't duplicate.
      const mrpSt = fStyle('showMrp', smallFontSize);
      const spSt = fStyle('showSalePrice', fontSize);
      const mrpPrefix = fLabel('showMrp');
      const spPrefix = fLabel('showSalePrice');
      if (key === 'showMrp' && !hasMrp && hasSalePrice) return null; // let showSalePrice's slot render it
      if (key === 'showSalePrice' && !hasSalePrice) return null;
      if (key === 'showMrp' && !hasMrp) return null;
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 3, margin: '3px 0 1px' }}>
          {hasMrp && (
            <span style={{ textDecoration: 'line-through', opacity: 0.5, ...mrpSt }}>
              {mrpPrefix != null ? (mrpPrefix ? `${mrpPrefix} ` : '') : 'MRP '}₹{Number(item.mrp).toFixed(2)}
            </span>
          )}
          {key === 'showMrp' && hasSalePrice && (
            <span style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: hasMrp ? spSt.fontSize * 1.05 : spSt.fontSize, color: spSt.color }}>
              {spPrefix != null ? (spPrefix ? `${spPrefix} ` : '') : ''}₹{Number(item.salePrice).toFixed(2)}
            </span>
          )}
          {key === 'showSalePrice' && !hasMrp && (
            <span style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: spSt.fontSize, color: spSt.color }}>
              {spPrefix != null ? (spPrefix ? `${spPrefix} ` : '') : ''}₹{Number(item.salePrice).toFixed(2)}
            </span>
          )}
        </div>
      );
    }
    case 'showExtraFields':
      return show(key) ? (
        (item?.barcodeExtraFields || []).filter((f) => f.label || f.value).map((f, i) => {
          const st = fStyle(key, smallFontSize);
          return (
            <p key={`extra-${i}`} style={{ margin: '1px 0', ...st }}>
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
// image wherever CODE_KEY happens to sit in that zone's list.
function ZoneContent({ keys, item, lbl, sizeConfig, mode, align }) {
  const { barcodeHeight, qrSize, barWidth, fontSize, smallFontSize } = sizeConfig;
  const show = (k) => lbl?.[k] !== false;
  const qrValue = item?.barcode || item?.itemCode || item?.name || 'item';

  const codeEl = mode === 'qr' ? (
    <div key={CODE_KEY} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <QRImage value={qrValue} size={Math.round(qrSize)} />
      {show('showBarcodeNumber') && item?.barcode && (
        <p style={{ margin: '2px 0 0', fontSize: smallFontSize, color: lbl?.textColor || '#555', textAlign: 'center' }}>{item.barcode}</p>
      )}
    </div>
  ) : (
    (show('showBarcode') && item?.barcode) ? (
      <div key={CODE_KEY} style={{ flexShrink: 0, width: '100%' }}>
        <BarcodeImage value={item.barcode} height={barcodeHeight} fontSize={smallFontSize} barWidth={barWidth} />
        {show('showBarcodeNumber') && (
          <p style={{ margin: 0, fontSize: smallFontSize, color: lbl?.textColor || '#555', textAlign: 'center' }}>{item.barcode}</p>
        )}
      </div>
    ) : null
  );

  const nodes = keys.map((k) => (k === CODE_KEY ? codeEl : renderLabelField(k, { item, lbl, fontSize, smallFontSize })));
  if (!nodes.some(Boolean)) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', textAlign: align, fontFamily: 'Arial, sans-serif', minWidth: 0 }}>
      {nodes}
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
    padding: isA4 ? '20px 24px' : '3px 4px',
    fontFamily: 'Arial, sans-serif',
    overflow: 'hidden',
    display: 'grid',
    gridTemplateAreas: '"top top top" "left center right" "bottom bottom bottom"',
    gridTemplateRows: 'auto 1fr auto',
    gridTemplateColumns: 'auto 1fr auto',
    rowGap: 2, columnGap: 4,
    boxSizing: 'border-box',
    backgroundColor: bgColor,
    border: isA4 ? 'none' : (borderStyle === 'none' ? 'none' : `0.5px ${borderStyle} #ccc`),
  };

  return (
    <div style={outerStyle}>
      {ZONES.map((z) => (
        <div key={z.key} style={{ gridArea: z.key, display: 'flex', justifyContent: z.key === 'left' ? 'flex-start' : z.key === 'right' ? 'flex-end' : 'center', alignItems: 'center' }}>
          <ZoneContent keys={zoneLayout[z.key]} item={item} lbl={lbl} sizeConfig={sizeConfig} mode={mode} align={align} />
        </div>
      ))}
    </div>
  );
};

export const QRLabel = ({ item, sizeConfig, lbl }) => <UnifiedLabel item={item} sizeConfig={sizeConfig} lbl={lbl} mode="qr" />;
export const BarcodeLabel = ({ item, sizeConfig, lbl }) => <UnifiedLabel item={item} sizeConfig={sizeConfig} lbl={lbl} mode="barcode" />;

// Renders all selected items (each with individual copies) on one printable
// sheet. forwardRef so react-to-print (used by BarcodeLabelPrintDialog.jsx)
// can print this exact, already-mounted node directly — same pattern as
// DigitZebra's BarcodePrintSheet/QRPrintSheet.
export const BulkLabelSheet = React.forwardRef(({ entries, sizeConfig, lbl, columns = 1, mode = 'barcode', extraStyle }, ref) => {
  const isA4 = sizeConfig.key === 'a4';
  const LabelComp = mode === 'qr' ? QRLabel : BarcodeLabel;
  return (
    <div ref={ref} style={{
      padding: isA4 ? 16 : 4, backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
      display: 'grid',
      gridTemplateColumns: `repeat(${isA4 ? Math.max(1, columns) : columns}, ${sizeConfig.width})`,
      gap: isA4 ? 8 : 2,
      width: isA4 ? '210mm' : undefined,
      ...extraStyle,
    }}>
      {entries.map(({ item, copies }) =>
        Array.from({ length: copies }).map((_, i) => (
          <LabelComp key={`${item.id}-${i}`} item={item} sizeConfig={sizeConfig} lbl={lbl} />
        ))
      )}
    </div>
  );
});
BulkLabelSheet.displayName = 'BulkLabelSheet';

export { ALL_LABEL_FIELDS };
