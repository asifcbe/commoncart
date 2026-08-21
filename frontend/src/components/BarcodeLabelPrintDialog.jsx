import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Barcode, Printer, QrCode } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import { useToast } from './ui/Toast';
import api from '../utils/api';
import { BulkLabelSheet } from './BarcodeLabel';
import {
  LABEL_SIZES, buildSizeConfig, DEFAULT_BARCODE_LABEL,
  productToLabelItem, qrDataURL, resolveZoneLayout,
} from '../utils/barcodeLabel';

// Print-only dialogs — the label's actual design (which fields go where,
// their styling, colors, borders) is configured exclusively on the Settings
// page (see Settings.jsx's "Barcode Label Printing Defaults" card +
// ZoneLayoutEditor) so there's one place a business owner sets it up, rather
// than it also being editable — and easy to accidentally change — from every
// Products/Purchase print dialog. These dialogs just fetch that saved
// layout, show a live preview of it, and let the user pick per-print-job
// mechanics (label size, copies, columns, scale) before printing.

const ACCENT = '#0d9488';

function TealSlider({ value, min, max, step, onChange, marks }) {
  return (
    <div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-600 cursor-pointer"
        style={{ accentColor: ACCENT }}
      />
      {marks && (
        <div className="flex justify-between text-[0.6rem] text-gray-400 -mt-1">
          {marks.map((m) => <span key={m.value}>{m.label}</span>)}
        </div>
      )}
    </div>
  );
}

function ToggleButtonGroup({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.value ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
          style={value === o.value ? { background: `linear-gradient(135deg, #0f766e 0%, ${ACCENT} 100%)` } : undefined}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

// Renders a hidden off-screen React tree to a static HTML string for the
// print window (Common_cart prints via window.open + document.write rather
// than react-to-print, so we render the same label components server-side
// via a detached root instead of hand-building HTML).
// `qrValues`: every QR string that might be encoded in `node`, pre-resolved
// into QRImage's cache *before* the tree renders — otherwise QRImage's async
// useEffect (data-URL generation) races the innerHTML read below with no
// reliable signal for "every QR has actually finished drawing".
async function renderPrintHTML(node, qrValues = []) {
  await Promise.all([...new Set(qrValues.filter(Boolean))].map((v) => qrDataURL(v).catch(() => null)));
  const host = document.createElement('div');
  const root = createRoot(host);
  await new Promise((resolve) => {
    root.render(node);
    // QRImage now finds its value already cached and renders synchronously
    // within this commit; one rAF is enough to let that paint before we read.
    requestAnimationFrame(resolve);
  });
  const html = host.innerHTML;
  root.unmount();
  return html;
}

function getPageStyle(sizeConfig, columns) {
  const isA4 = sizeConfig.key === 'a4';
  if (isA4) return '@page { size: A4 portrait; margin: 8mm; } body { margin: 0; }';
  const wMm = parseFloat(sizeConfig.width) || 80;
  const hMm = parseFloat(sizeConfig.height) || 40;
  const totalW = wMm * Math.max(1, Number(columns) || 1);
  return `@page { size: ${totalW}mm ${hMm}mm; margin: 0; } body { margin: 0; padding: 0; }`;
}

function openPrintWindow(bodyHTML, pageStyle, onError) {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) { onError?.('Pop-up blocked. Please allow pop-ups for this site.'); return false; }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Barcode Labels</title>
<style>* { box-sizing: border-box; } ${pageStyle}
@media screen { body { background:#eee; } }
@media print { body { background:white; } }</style></head>
<body>${bodyHTML}<script>window.onload=function(){window.print()};<\/script></body></html>`;
  win.document.write(html);
  win.document.close();
  return true;
}

// Loads the label design saved in Settings (fields, zones, styling) plus its
// per-print-job defaults (size/copies/columns/scale) once when a dialog
// opens. Read-only from here on — nothing in these dialogs writes back to
// `/settings/label-print-config`.
function useSavedLabelConfig() {
  const [lbl, setLbl] = useState(DEFAULT_BARCODE_LABEL);
  const [zones, setZones] = useState(() => resolveZoneLayout(DEFAULT_BARCODE_LABEL));
  const [labelSizeKey, setLabelSizeKey] = useState(DEFAULT_BARCODE_LABEL.defaultLabelSize);
  const [columns, setColumns] = useState(DEFAULT_BARCODE_LABEL.columns);
  const [contentScale, setContentScale] = useState(DEFAULT_BARCODE_LABEL.contentScale);
  const [codeScale, setCodeScale] = useState(DEFAULT_BARCODE_LABEL.codeScale);
  const [copies, setCopies] = useState(DEFAULT_BARCODE_LABEL.copies);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/settings/label-print-config').then(({ data }) => {
      const c = { ...DEFAULT_BARCODE_LABEL, ...data.config };
      setLbl(c);
      setZones(resolveZoneLayout(c));
      setLabelSizeKey(c.defaultLabelSize);
      setColumns(c.columns);
      setContentScale(c.contentScale);
      setCodeScale(c.codeScale);
      setCopies(c.copies);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const lblWithZones = { ...lbl, zones };
  return {
    lbl: lblWithZones, loaded,
    labelSizeKey, setLabelSizeKey,
    columns, setColumns,
    contentScale, setContentScale,
    codeScale, setCodeScale,
    copies, setCopies,
  };
}

/* ── Single-item dialog ── */
export function BarcodeDialog({ item, businessName, onClose }) {
  const toast = useToast();
  const {
    lbl, labelSizeKey, setLabelSizeKey, columns, setColumns,
    contentScale, setContentScale, codeScale, setCodeScale,
    copies, setCopies,
  } = useSavedLabelConfig();
  const [printMode, setPrintMode] = useState('barcode');
  const [printing, setPrinting] = useState(false);

  if (!item) return null;

  const sizeEntry = LABEL_SIZES.find((s) => s.key === labelSizeKey) || LABEL_SIZES[0];
  const sizeConfig = buildSizeConfig(sizeEntry, contentScale, codeScale);
  const labelItem = productToLabelItem(item, businessName);
  const hasContent = !!(labelItem.barcode || printMode === 'qr');

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const finalCopies = Math.max(1, Number(copies) || 1);
      const finalColumns = Math.max(1, Number(columns) || 1);
      const entries = [{ item: labelItem, copies: finalCopies }];
      const qrValue = labelItem.barcode || labelItem.itemCode || labelItem.name || 'item';
      const html = await renderPrintHTML(
        <BulkLabelSheet entries={entries} sizeConfig={sizeConfig} lbl={lbl} columns={finalColumns} mode={printMode} />,
        printMode === 'qr' ? [qrValue] : []
      );
      openPrintWindow(html, getPageStyle(sizeConfig, finalColumns), (msg) => toast({ message: msg, type: 'error' }));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={
      <span className="flex items-center gap-1.5">
        {printMode === 'qr' ? <QrCode size={18} /> : <Barcode size={18} />}
        {printMode === 'qr' ? 'QR Code Label' : 'Barcode Label'}
      </span>
    }>
      <div className="flex justify-center mb-3">
        <ToggleButtonGroup
          value={printMode}
          onChange={setPrintMode}
          options={[
            { value: 'barcode', label: 'Barcode', icon: <Barcode size={15} /> },
            { value: 'qr', label: 'QR Code', icon: <QrCode size={15} /> },
          ]}
        />
      </div>

      <div className="text-center mb-3">
        {!hasContent && (
          <p className="text-sm text-gray-500">No barcode value assigned to this item. Switch to QR mode to print without a barcode.</p>
        )}
        <p className="text-[0.65rem] text-gray-400 mt-1">
          Label design is set in Settings → Barcode Label Printing Defaults.
        </p>
      </div>

      {hasContent && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex-[3] min-w-40">
            <label className="text-xs font-medium text-gray-600 block mb-1">Label Size</label>
            <Select value={labelSizeKey} onChange={(e) => setLabelSizeKey(e.target.value)}>
              {LABEL_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </div>
          <div className="flex-1 min-w-16">
            <label className="text-xs font-medium text-gray-600 block mb-1">Columns</label>
            <Input type="number" min="1" max="8" value={columns}
              onChange={(e) => setColumns(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
            <p className="text-[0.65rem] text-gray-400 mt-0.5">Side-by-side</p>
          </div>
          <div className="flex-1 min-w-16">
            <label className="text-xs font-medium text-gray-600 block mb-1">Copies</label>
            <Input type="number" min="1" max="500" value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </div>
        </div>
      )}

      {hasContent && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-semibold text-gray-600">Content Size</span>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>{Math.round(contentScale * 100)}%</span>
          </div>
          <TealSlider value={contentScale} min={0.4} max={2.0} step={0.05} onChange={setContentScale}
            marks={[{ value: 0.4, label: '40%' }, { value: 1.0, label: '100%' }, { value: 2.0, label: '200%' }]} />
          <div className="flex items-center justify-between mb-0.5 mt-2">
            <span className="text-xs font-semibold text-gray-600">Code Size</span>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>{Math.round(codeScale * 100)}%</span>
          </div>
          <TealSlider value={codeScale} min={0.3} max={3.0} step={0.05} onChange={setCodeScale}
            marks={[{ value: 0.3, label: '30%' }, { value: 1.0, label: '100%' }, { value: 3.0, label: '300%' }]} />
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t">
        <Button variant="outline" onClick={onClose}>Close</Button>
        {hasContent && (
          <Button
            onClick={handlePrint}
            disabled={printing}
            style={{ background: `linear-gradient(135deg, #0f766e 0%, ${ACCENT} 100%)` }}
          >
            <Printer size={16} className="mr-2" />
            Print{(Number(copies) || 1) > 1 || (Number(columns) || 1) > 1 ? ` (${Number(copies) || 1} × ${Number(columns) || 1} col)` : ''}
          </Button>
        )}
      </div>
    </Modal>
  );
}

/* ── Bulk (multi-item) dialog ── */
export function BulkBarcodeDialog({ items, businessName, onClose }) {
  const toast = useToast();
  const {
    lbl, labelSizeKey, setLabelSizeKey, columns, setColumns,
    contentScale, setContentScale, codeScale, setCodeScale, copies: defaultCopies,
  } = useSavedLabelConfig();
  const [printMode, setPrintMode] = useState('barcode');
  const [copiesMap, setCopiesMap] = useState({});
  const [printing, setPrinting] = useState(false);

  // Fill in each item's copy count from the saved default once it loads.
  useEffect(() => {
    setCopiesMap((q) => {
      const next = { ...q };
      items.forEach((it) => { if (next[it.id ?? it._id] == null) next[it.id ?? it._id] = Math.max(1, Number(defaultCopies) || 1); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCopies, items]);

  if (!items?.length) return null;

  const sizeEntry = LABEL_SIZES.find((s) => s.key === labelSizeKey) || LABEL_SIZES[0];
  const sizeConfig = buildSizeConfig(sizeEntry, contentScale, codeScale);
  const columnsNum = Math.max(1, Number(columns) || 1);

  const getCopies = (id) => copiesMap[id] ?? 1;
  const setCopies = (id, val) => setCopiesMap((prev) => ({ ...prev, [id]: val === '' ? '' : Math.max(1, Math.min(500, Number(val) || 1)) }));
  const commitCopies = (id) => setCopiesMap((prev) => ({ ...prev, [id]: Math.max(1, Math.min(500, Number(prev[id]) || 1)) }));

  const entries = items.map((it) => {
    const id = it.id ?? it._id;
    return { item: productToLabelItem(it, businessName), copies: Math.max(1, Number(getCopies(id)) || 1), id };
  });
  const totalLabels = entries.reduce((s, e) => s + e.copies, 0);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const printEntries = entries.filter((e) => e.copies > 0).map((e) => ({ item: e.item, copies: e.copies }));
      if (!printEntries.length) { toast({ message: 'Nothing to print', type: 'warning' }); return; }
      const qrValues = printEntries.map((e) => e.item.barcode || e.item.itemCode || e.item.name || 'item');
      const html = await renderPrintHTML(
        <BulkLabelSheet entries={printEntries} sizeConfig={sizeConfig} lbl={lbl} columns={columnsNum} mode={printMode} />,
        printMode === 'qr' ? qrValues : []
      );
      openPrintWindow(html, getPageStyle(sizeConfig, columnsNum), (msg) => toast({ message: msg, type: 'error' }));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`Print Barcodes — ${items.length} item${items.length > 1 ? 's' : ''} · ${totalLabels} labels`}>
      {/* Shared settings row */}
      <div className="flex gap-3 flex-wrap mb-2 p-3 bg-gray-50 rounded-lg items-end">
        <ToggleButtonGroup
          value={printMode}
          onChange={setPrintMode}
          options={[
            { value: 'barcode', label: 'Barcode', icon: <Barcode size={14} /> },
            { value: 'qr', label: 'QR Code', icon: <QrCode size={14} /> },
          ]}
        />
        <div className="min-w-40">
          <label className="text-xs font-medium text-gray-600 block mb-1">Label Size</label>
          <Select value={labelSizeKey} onChange={(e) => setLabelSizeKey(e.target.value)}>
            {LABEL_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
        <div className="w-20">
          <label className="text-xs font-medium text-gray-600 block mb-1">Columns</label>
          <Input type="number" min="1" max="8" value={columns}
            onChange={(e) => setColumns(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
        </div>
        <div className="min-w-32">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-semibold text-gray-600">Content</span>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>{Math.round(contentScale * 100)}%</span>
          </div>
          <TealSlider value={contentScale} min={0.4} max={2.0} step={0.1} onChange={setContentScale} />
        </div>
        <div className="min-w-32">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-semibold text-gray-600">Code Size</span>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>{Math.round(codeScale * 100)}%</span>
          </div>
          <TealSlider value={codeScale} min={0.3} max={3.0} step={0.1} onChange={setCodeScale} />
        </div>
      </div>
      <p className="text-[0.65rem] text-gray-400 mb-3">
        Label design is set in Settings → Barcode Label Printing Defaults.
      </p>

      {/* Per-item rows */}
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
        {entries.map(({ item, id }) => {
          const copies = copiesMap[id] ?? 1;
          return (
            <div key={id} className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-lg bg-white">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                <p className="text-xs text-gray-400 font-mono truncate">
                  {[item.itemCode, item.barcode && `Barcode: ${item.barcode}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-semibold text-gray-600">Copies</span>
                <Input type="number" min="0" max="500" value={copies}
                  onChange={(e) => setCopies(id, e.target.value)}
                  onBlur={() => commitCopies(id)}
                  className="w-16 text-center font-bold" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button
          onClick={handlePrint}
          disabled={printing || totalLabels === 0}
          style={{ background: `linear-gradient(135deg, #0f766e 0%, ${ACCENT} 100%)` }}
        >
          <Printer size={16} className="mr-2" />
          Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
        </Button>
      </div>
    </Modal>
  );
}
