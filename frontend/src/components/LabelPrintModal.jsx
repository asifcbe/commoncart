import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import { useToast } from './ui/Toast';
import api from '../utils/api';
import {
  LABEL_SIZES, resolveLabelSize, barcodeDataURL, buildLabelsHTML, printLabels, DEFAULT_LABEL_PRINT,
} from '../utils/labels';

const MM_TO_PX = 3.78; // 96dpi: 1mm ≈ 3.7795px — used to scale the on-screen preview

// Reusable barcode-label print dialog with a live preview.
// `items`: [{ id, name, barcode, price, discountPrice, color, size, SKU, quantity }]
// `defaultQty(item)`: optional → initial copies per item (defaults to 1).
export default function LabelPrintModal({ items, onClose, defaultQty }) {
  const toast = useToast();

  const [cfg, setCfg] = useState(DEFAULT_LABEL_PRINT);
  const [sizeId, setSizeId] = useState(DEFAULT_LABEL_PRINT.sizeId);
  const [customW, setCustomW] = useState(DEFAULT_LABEL_PRINT.customWidthMm);
  const [customH, setCustomH] = useState(DEFAULT_LABEL_PRINT.customHeightMm);
  const [layout, setLayout] = useState(DEFAULT_LABEL_PRINT.layout);
  const [symbology, setSymbology] = useState(DEFAULT_LABEL_PRINT.symbology);
  const [content, setContent] = useState(DEFAULT_LABEL_PRINT.content);
  const [businessName, setBusinessName] = useState('');
  const [pricePrefix, setPricePrefix] = useState(DEFAULT_LABEL_PRINT.pricePrefix);
  const [discountPrefix, setDiscountPrefix] = useState(DEFAULT_LABEL_PRINT.discountPrefix);

  const [qtys, setQtys] = useState(() => {
    const m = {};
    items.forEach((it) => { m[it.id] = defaultQty ? Math.max(0, defaultQty(it)) : null; });
    return m;
  });
  // Which items are included in the print run. Unchecking excludes an item without
  // losing its typed quantity — re-checking restores it.
  const [selected, setSelected] = useState(() => new Set(items.map((it) => it.id)));
  const [itemSearch, setItemSearch] = useState('');

  // Load saved defaults once; apply them to the live controls.
  useEffect(() => {
    api.get('/settings/label-print-config').then(({ data }) => {
      const c = { ...DEFAULT_LABEL_PRINT, ...data.config, content: { ...DEFAULT_LABEL_PRINT.content, ...(data.config?.content || {}) } };
      setCfg(c);
      setSizeId(c.sizeId); setCustomW(c.customWidthMm); setCustomH(c.customHeightMm);
      setLayout(c.layout); setSymbology(c.symbology); setContent(c.content);
      setPricePrefix(c.pricePrefix ?? DEFAULT_LABEL_PRINT.pricePrefix);
      setDiscountPrefix(c.discountPrefix ?? DEFAULT_LABEL_PRINT.discountPrefix);
      // Fill in copies for items that didn't get an explicit defaultQty from the caller.
      const copies = Math.max(1, Number(c.defaultCopies) || 1);
      setQtys((q) => {
        const next = { ...q };
        items.forEach((it) => { if (next[it.id] == null) next[it.id] = copies; });
        return next;
      });
    }).catch(() => {});
    // Company name printed on the label comes from the business config.
    // Keep any non-empty saved name; otherwise leave the editable fallback.
    api.get('/settings/business-config')
      .then(({ data }) => { const n = (data.config?.businessName || '').trim(); if (n) setBusinessName(n); })
      .catch(() => {});
  }, []);

  // Content passed to the renderer carries the resolved business name + price prefixes.
  const effectiveContent = useMemo(
    () => ({ ...content, businessName, pricePrefix, discountPrefix }),
    [content, businessName, pricePrefix, discountPrefix]
  );

  const size = resolveLabelSize(sizeId, customW, customH);
  const totalLabels = useMemo(
    () => items.reduce((s, it) => s + (selected.has(it.id) ? Number(qtys[it.id]) || 0 : 0), 0),
    [items, qtys, selected]
  );
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.name, it.barcode, it.color, it.size, it.SKU].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [items, itemSearch]);
  // "Select all" acts on whatever is currently visible (respects an active search).
  const allSelected = filteredItems.length > 0 && filteredItems.every((it) => selected.has(it.id));

  const setQty = (id, val) => setQtys((q) => ({ ...q, [id]: Math.max(0, Math.min(999, Number(val) || 0)) }));
  const toggle = (k) => setContent((c) => ({ ...c, [k]: !c[k] }));
  const toggleSelected = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelected((s) => {
    if (allSelected) {
      const next = new Set(s);
      filteredItems.forEach((it) => next.delete(it.id));
      return next;
    }
    return new Set([...s, ...filteredItems.map((it) => it.id)]);
  });

  // Barcode images (bars only — the number is rendered in the name row).
  const barcodeImgs = useMemo(() => {
    const m = {};
    items.forEach((it) => { m[it.id] = barcodeDataURL(it.barcode, symbology, false); });
    return m;
  }, [items, symbology]);

  // Preview uses the first selected item (or two, in 2-up) rendered at real mm scale.
  const previewEntries = useMemo(() => {
    const toEntry = (it) => ({ ...it, barcodeImg: barcodeImgs[it.id] });
    const included = items.filter((it) => selected.has(it.id));
    if (size.sheet) return included.slice(0, 4).map(toEntry);
    if (layout === '2up') return included.slice(0, 2).map(toEntry);
    return included.slice(0, 1).map(toEntry);
  }, [items, barcodeImgs, layout, size.sheet, selected]);

  const previewHTML = useMemo(
    () => buildLabelsHTML(previewEntries.length ? previewEntries : [{ id: '_', name: 'Sample', barcodeImg: barcodeImgs[items[0]?.id], price: 0 }], { size, layout, content: effectiveContent }),
    [previewEntries, size, layout, effectiveContent, barcodeImgs, items]
  );

  const handlePrint = () => {
    const entries = [];
    items.forEach((it) => {
      if (!selected.has(it.id)) return; // skip unselected items
      const count = Number(qtys[it.id]) || 0;
      if (count === 0) return; // skip items with 0 qty
      const entry = { ...it, barcodeImg: barcodeImgs[it.id] };
      for (let i = 0; i < count; i++) entries.push(entry);
    });
    if (entries.length === 0) { toast({ message: 'Nothing selected to print', type: 'warning' }); return; }
    printLabels(entries, { size, layout, content: effectiveContent }, (msg) => toast({ message: msg, type: 'error' }));
  };

  // Scale the preview so a label fits comfortably (cap the larger dimension).
  const maxPreviewPx = 230;
  const scale = Math.min(1, maxPreviewPx / (Math.max(size.w, size.h) * MM_TO_PX));

  return (
    <Modal open onClose={onClose} title="Print Barcode Labels" size="full">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-8">
        {/* ── Left: options ── */}
        <div className="space-y-5">
          {/* Size */}
          <div>
            <label className="text-sm font-medium block mb-2">Label Size</label>
            <div className="grid grid-cols-2 gap-2">
              {LABEL_SIZES.map((s) => (
                <button key={s.id} type="button" onClick={() => setSizeId(s.id)}
                  className={`text-left px-3 py-2 rounded-lg border-2 transition-colors text-xs ${sizeId === s.id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-gray-400 mt-0.5">{s.desc}</div>
                </button>
              ))}
              <button type="button" onClick={() => setSizeId('custom')}
                className={`text-left px-3 py-2 rounded-lg border-2 transition-colors text-xs ${sizeId === 'custom' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="font-semibold">Custom size</div>
                <div className="text-gray-400 mt-0.5">Set width × height (mm)</div>
              </button>
            </div>
            {sizeId === 'custom' && (
              <div className="flex items-center gap-2 mt-2">
                <Input type="number" min="10" max="300" value={customW} onChange={(e) => setCustomW(Number(e.target.value))} className="w-24 h-8 text-sm" />
                <span className="text-gray-400 text-sm">×</span>
                <Input type="number" min="10" max="300" value={customH} onChange={(e) => setCustomH(Number(e.target.value))} className="w-24 h-8 text-sm" />
                <span className="text-gray-400 text-sm">mm</span>
              </div>
            )}
          </div>

          {/* Layout + symbology */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-2">Layout</label>
              <div className="flex gap-2">
                {[['1up', '1 per row'], ['2up', '2 per row']].map(([id, lbl]) => (
                  <button key={id} type="button" onClick={() => setLayout(id)} disabled={size.sheet}
                    className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-colors disabled:opacity-40 ${layout === id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {size.sheet && <p className="text-[11px] text-gray-400 mt-1">Sheet uses a fixed grid.</p>}
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Barcode Type</label>
              <div className="flex gap-2">
                {[['CODE128', 'CODE128'], ['EAN13', 'EAN-13']].map(([id, lbl]) => (
                  <button key={id} type="button" onClick={() => setSymbology(id)}
                    className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-colors ${symbology === id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {symbology === 'EAN13' && <p className="text-[11px] text-gray-400 mt-1">Non-EAN codes fall back to CODE128.</p>}
            </div>
          </div>

          {/* Content toggles */}
          <div>
            <label className="text-sm font-medium block mb-2">Label Content</label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!content.company} onChange={() => toggle('company')} className="rounded" />
                Company name
              </label>
              {[['name', 'Name'], ['price', 'Price'], ['variant', 'Variant'], ['size', 'Size'], ['sku', 'SKU']].map(([k, lbl]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={!!content[k]} onChange={() => toggle(k)} className="rounded" />{lbl}
                </label>
              ))}
            </div>
            {content.company && (
              <div className="mt-2">
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Company name to print"
                  className="h-8 text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1">Defaults to your Business Name from Settings; edit for this print if needed.</p>
              </div>
            )}
            {content.price && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Price label</label>
                  <Input value={pricePrefix} onChange={(e) => setPricePrefix(e.target.value)} placeholder="e.g. MRP" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Discount label</label>
                  <Input value={discountPrefix} onChange={(e) => setDiscountPrefix(e.target.value)} placeholder="e.g. Offer Price" className="h-8 text-sm" />
                </div>
                <p className="text-[11px] text-gray-400 col-span-2 -mt-1">Printed before each price (e.g. "MRP: ₹100"). Leave blank for no label.</p>
              </div>
            )}
          </div>

          {/* Items to print */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Items to Print <span className="text-gray-400 font-normal">({selected.size} of {items.length} selected)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" />
                Select all
              </label>
            </div>
            {items.length > 8 && (
              <Input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search by name, barcode, color, size…"
                className="h-8 text-sm mb-2"
              />
            )}
            <div className="border rounded-lg max-h-[420px] overflow-y-auto bg-gray-50 p-2">
              {filteredItems.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-gray-400">No items match "{itemSearch}"</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {filteredItems.map((it) => {
                  const isSelected = selected.has(it.id);
                  return (
                    <div key={it.id} className={`flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg border transition-colors ${isSelected ? 'bg-white border-gray-200' : 'bg-gray-100 border-transparent opacity-60'}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(it.id)} className="rounded shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {[it.color, it.size].filter(Boolean).join(' / ')}
                          {(it.color || it.size) && it.barcode ? ' · ' : ''}
                          <span className="font-mono">{it.barcode}</span>
                        </div>
                      </div>
                      <Input type="number" min="0" max="999" value={qtys[it.id] ?? 0} disabled={!isSelected}
                        onChange={(e) => setQty(it.id, e.target.value)} className="w-14 h-8 text-sm text-center shrink-0 px-1" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div className="space-y-3">
          <label className="text-sm font-medium block">Preview <span className="text-gray-400 font-normal">({size.label})</span></label>
          <div className="rounded-lg border bg-gray-100 p-4 flex items-center justify-center min-h-[260px] overflow-auto">
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
              <iframe
                title="label-preview"
                className="bg-white shadow-sm border"
                style={{
                  width: `${(size.sheet ? 130 : layout === '2up' ? size.w * 2 : size.w) * MM_TO_PX}px`,
                  height: `${(size.sheet ? 80 : size.h) * MM_TO_PX}px`,
                  border: 'none',
                }}
                srcDoc={`<!DOCTYPE html><html><head><style>*{box-sizing:border-box;font-family:Arial,sans-serif;margin:0}${previewHTML.css.replace(/@page[^}]*}/g, '')}.label{border:0.2mm solid #eee}</style></head><body style="margin:0">${previewHTML.body}</body></html>`}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Preview is approximate; exact output depends on your printer/driver settings.
            For dedicated label printers (Zebra, DYMO, TSC, Brother), set the matching media size in the driver.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{totalLabels}</span> label{totalLabels !== 1 ? 's' : ''}
          {' · '}<span className="text-gray-500">{size.label} · {layout === '2up' && !size.sheet ? '2-up' : '1-up'}</span>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrint} disabled={totalLabels === 0}>
            <Printer size={15} className="mr-2" /> Send to Printer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
