import React, { useRef, useState } from 'react';
import { Barcode } from 'lucide-react';
import Input from './ui/Input';
import Select from './ui/Select';
import { ALL_LABEL_FIELDS, CONTENT_ALIGNS, BORDER_STYLES, ZONES, CODE_KEY } from '../utils/barcodeLabel';

// The 5-zone drag-and-drop label layout editor — lives on the Settings page
// only (Products/Purchase print dialogs preview the saved design). It writes a
// `zones` map; Settings.jsx bridges that to DigitZebra's codePosition +
// fieldOrder (via zonesToLayout) which is what actually renders the label.

export const ACCENT = '#0d9488';

const CODE_CHIP_META = { key: CODE_KEY, defaultLabel: 'Barcode / QR' };
const fieldMeta = (key) => (key === CODE_KEY ? CODE_CHIP_META : ALL_LABEL_FIELDS.find((f) => f.key === key));

// One draggable chip — a field, or the special barcode/QR placeholder —
// shown inside whichever zone box currently holds it.
function ZoneChip({ zoneKey, itemKey, lbl, onDragStart, onDragOver, onDrop, onDragEnd, isDropTarget, onToggleExpand, isCode }) {
  const meta = fieldMeta(itemKey);
  if (!meta) return null;
  const on = isCode ? true : lbl[itemKey] !== false;
  const fst = (lbl.fieldStyles || {})[itemKey] || {};
  const customLabel = (lbl.fieldLabels || {})[itemKey];

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(e, zoneKey, itemKey); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; onDragOver(zoneKey, itemKey); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); if (!isCode) onToggleExpand(itemKey); }}
      className="flex items-center gap-1 px-1.5 py-1 rounded select-none transition-colors"
      style={{
        cursor: isCode ? 'grab' : 'pointer',
        border: `1px solid ${isDropTarget ? ACCENT : (on ? 'rgba(13,148,136,0.35)' : '#e5e7eb')}`,
        background: isDropTarget ? 'rgba(13,148,136,0.15)' : (isCode ? 'rgba(13,148,136,0.1)' : (on ? 'rgba(13,148,136,0.06)' : '#f9fafb')),
        opacity: on ? 1 : 0.55,
      }}
    >
      <span className="text-gray-400 text-[0.65rem] cursor-grab shrink-0">⠿</span>
      {isCode ? <Barcode size={11} style={{ color: ACCENT }} className="shrink-0" /> : null}
      <span className="text-[0.68rem] font-semibold truncate" style={{ color: isCode ? ACCENT : (on ? '#374151' : '#9ca3af'), maxWidth: 84 }}>
        {isCode ? meta.defaultLabel : (customLabel || meta.defaultLabel)}
      </span>
      {!isCode && fst.color && <span className="w-2 h-2 rounded-full border border-gray-300 shrink-0" style={{ background: fst.color }} />}
    </div>
  );
}

// The 5-zone drag-and-drop grid — mirrors the printed label's own
// top/left/center/right/bottom layout so placement is WYSIWYG. Dropping a
// chip on another chip within a zone reorders; dropping on an empty zone
// (or the zone's own background) moves it there, appended at the end.
function ZoneDropArea({ zoneKey, label, keys, lbl, dragState, onDragStart, onDragOverItem, onDragOverZone, onDrop, onDragEnd, onToggleExpand, gridArea }) {
  const isZoneTarget = dragState.overZone === zoneKey && !dragState.overKey;
  // top/bottom span the label width — lay chips out in a wrapping row so the
  // editor previews the same "2–3 fields on one line" the printed label does.
  const rowLayout = (zoneKey === 'top' || zoneKey === 'bottom') && !keys.includes(CODE_KEY);
  return (
    <div
      style={{ gridArea }}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; onDragOverZone(zoneKey); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className="rounded-md p-1.5 flex flex-col gap-1 min-h-[38px]"
    >
      <p className="text-[0.58rem] font-bold uppercase tracking-wider text-gray-400 text-center">{label}</p>
      <div
        className={`flex-1 rounded gap-1 p-1 transition-colors flex ${rowLayout ? 'flex-row flex-wrap items-start' : 'flex-col'}`}
        style={{
          border: `1.5px dashed ${isZoneTarget ? ACCENT : '#e5e7eb'}`,
          background: isZoneTarget ? 'rgba(13,148,136,0.06)' : 'transparent',
          minHeight: 34,
        }}
      >
        {keys.length === 0 && <span className="text-[0.6rem] text-gray-300 text-center py-1">Drop here</span>}
        {keys.map((k) => (
          <ZoneChip
            key={k}
            zoneKey={zoneKey}
            itemKey={k}
            lbl={lbl}
            isCode={k === CODE_KEY}
            isDropTarget={dragState.overZone === zoneKey && dragState.overKey === k}
            onDragStart={onDragStart}
            onDragOver={onDragOverItem}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
    </div>
  );
}

// `lbl`: the full label config object (fields on/off, fieldStyles,
// fieldLabels, contentAlign, borderStyle, backgroundColor, textColor).
// `zones`: the 5-zone placement map — see resolveZoneLayout() in
// utils/barcodeLabel.js.
// `setLbl`/`setZones`: setState-style updaters (accept either a value or a
// (prev) => next updater fn) — the caller owns the actual state and decides
// when/how it's persisted (Settings.jsx saves it via an explicit button).
export default function ZoneLayoutEditor({ lbl, setLbl, zones, setZones }) {
  const [expandedField, setExpandedField] = useState(null);
  const dragRef = useRef(null);                                    // { fromZone, key } — drag source
  const overRef = useRef({ overZone: null, overKey: null });       // current hover target, updated synchronously
  const [dragState, setDragState] = useState({ overZone: null, overKey: null }); // same data, for highlight only

  const setLblKey = (key, val) => setLbl((prev) => ({ ...prev, [key]: val }));
  const setFieldStyle = (fieldKey, prop, val) => setLbl((prev) => ({
    ...prev,
    fieldStyles: { ...(prev.fieldStyles || {}), [fieldKey]: { ...((prev.fieldStyles || {})[fieldKey] || {}), [prop]: val } },
  }));
  const setFieldLabel = (fieldKey, val) => setLbl((prev) => ({
    ...prev,
    fieldLabels: { ...(prev.fieldLabels || {}), [fieldKey]: val },
  }));

  // `drop` (a discrete event) can fire before React flushes the state update
  // from the final `dragover` (a lower-priority continuous event), so the drop
  // target is tracked in a ref (read synchronously in handleDrop) and mirrored
  // into state only to drive the highlight.
  const handleDragStart = (e, fromZone, key) => {
    dragRef.current = { fromZone, key };
    overRef.current = { overZone: fromZone, overKey: key };
    if (e && e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', key); } catch { /* older browsers */ }
    }
  };
  const handleDragOverItem = (zoneKey, key) => {
    overRef.current = { overZone: zoneKey, overKey: key };
    setDragState((s) => (s.overZone === zoneKey && s.overKey === key ? s : { overZone: zoneKey, overKey: key }));
  };
  const handleDragOverZone = (zoneKey) => {
    overRef.current = { overZone: zoneKey, overKey: null };
    setDragState((s) => (s.overZone === zoneKey && s.overKey === null ? s : { overZone: zoneKey, overKey: null }));
  };
  const resetDrag = () => {
    dragRef.current = null;
    overRef.current = { overZone: null, overKey: null };
    setDragState({ overZone: null, overKey: null });
  };

  const handleDrop = () => {
    const drag = dragRef.current;
    const target = overRef.current;
    resetDrag();
    if (!drag || !target.overZone) return;
    const { fromZone, key } = drag;
    if (fromZone === target.overZone && target.overKey === key) return; // dropped on itself

    setZones((prev) => {
      const next = {};
      ZONES.forEach((z) => { next[z.key] = [...(prev[z.key] || [])]; });
      // Remove from source zone first (so within-zone reorder indexes line up).
      next[fromZone] = next[fromZone].filter((k) => k !== key);
      // Insert into target zone — before overKey if dropped on a chip, else appended.
      const destList = next[target.overZone] || (next[target.overZone] = []);
      let at = target.overKey ? destList.indexOf(target.overKey) : destList.length;
      if (at === -1) at = destList.length;
      destList.splice(at, 0, key);
      return next;
    });
  };

  const expandedMeta = expandedField ? fieldMeta(expandedField) : null;
  const fst = expandedField ? (lbl.fieldStyles || {})[expandedField] || {} : {};
  const customLabel = expandedField ? (lbl.fieldLabels || {})[expandedField] ?? '' : '';
  const sizeVal = fst.size || 'medium';
  const onExpanded = expandedField ? lbl[expandedField] !== false : false;

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-gray-500 mb-1">Label Layout</p>
      <p className="text-[0.65rem] text-gray-400 mb-2">Drag any field (or the barcode) into a zone. Tap a field chip to style it.</p>

      {/* 5-zone grid, shaped like the printed label */}
      <div
        style={{
          display: 'grid',
          gridTemplateAreas: '"top top top" "left center right" "bottom bottom bottom"',
          gridTemplateColumns: '1fr 1.2fr 1fr',
          gap: 4,
          background: '#fafafa',
          border: '1px solid #eee',
        }}
        className="mb-3 p-2 rounded-lg"
      >
        {ZONES.map((z) => (
          <ZoneDropArea
            key={z.key}
            zoneKey={z.key}
            label={z.label}
            keys={zones[z.key] || []}
            lbl={lbl}
            dragState={dragState}
            onDragStart={handleDragStart}
            onDragOverItem={handleDragOverItem}
            onDragOverZone={handleDragOverZone}
            onDrop={handleDrop}
            onDragEnd={resetDrag}
            onToggleExpand={(k) => setExpandedField((cur) => (cur === k ? null : k))}
            gridArea={z.key}
          />
        ))}
      </div>

      {/* Field visibility toggles — flat list, independent of placement */}
      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-gray-500 mb-1">Fields Shown</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {ALL_LABEL_FIELDS.filter((f) => f.key !== 'showBarcode').map((f) => {
          const on = lbl[f.key] !== false;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setLblKey(f.key, !on)}
              className="px-1.5 py-0.5 rounded text-[0.62rem] font-bold"
              style={{
                background: on ? 'rgba(13,148,136,0.12)' : '#f3f4f6',
                color: on ? ACCENT : '#9ca3af',
                border: `1px solid ${on ? 'rgba(13,148,136,0.3)' : '#e5e7eb'}`,
              }}
            >
              {f.defaultLabel}
            </button>
          );
        })}
      </div>

      {/* Selected field's style editor */}
      {expandedField && expandedMeta && (
        <div className="mb-3 px-2 py-2 rounded-md" style={{ border: '1px solid rgba(13,148,136,0.3)', background: 'rgba(13,148,136,0.02)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold" style={{ color: ACCENT }}>{expandedMeta.defaultLabel}</span>
            <button type="button" onClick={() => setLblKey(expandedField, !onExpanded)}
              className="px-1.5 py-0.5 rounded text-[0.62rem] font-bold"
              style={{ background: onExpanded ? 'rgba(13,148,136,0.15)' : '#f3f4f6', color: onExpanded ? ACCENT : '#9ca3af', border: `1px solid ${onExpanded ? 'rgba(13,148,136,0.3)' : '#e5e7eb'}` }}>
              {onExpanded ? 'ON' : 'OFF'}
            </button>
          </div>
          <Input
            placeholder={expandedMeta.defaultLabel}
            value={customLabel}
            onChange={(e) => setFieldLabel(expandedField, e.target.value)}
            className="h-8 text-xs mb-1"
          />
          <p className="text-[0.65rem] text-gray-400 mb-2">Leave blank to hide label prefix</p>
          <p className="text-xs font-semibold text-gray-600 mb-1">Size</p>
          <div className="flex gap-1 flex-wrap mb-2">
            {[['xs', 'XS'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['xl', 'XL'], ['2xl', '2XL']].map(([sz, label]) => {
              const active = sizeVal === sz || (sz === 'md' && (sizeVal === 'medium' || !sizeVal));
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFieldStyle(expandedField, 'size', sz)}
                  className="flex-1 text-center py-1 px-1 rounded text-[0.62rem]"
                  style={{
                    border: `1px solid ${active ? ACCENT : '#e5e7eb'}`,
                    fontWeight: active ? 700 : 400,
                    background: active ? 'rgba(13,148,136,0.12)' : 'transparent',
                    color: active ? ACCENT : '#6b7280',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 shrink-0">Color</span>
            <input type="color" value={fst.color || lbl.textColor || '#000000'} onChange={(e) => setFieldStyle(expandedField, 'color', e.target.value)}
              className="flex-1 h-7 border border-gray-300 rounded cursor-pointer p-0.5" />
            {fst.color && (
              <button type="button" onClick={() => setFieldStyle(expandedField, 'color', '')} className="text-[0.65rem] text-gray-400 hover:text-red-500">
                reset
              </button>
            )}
          </div>
        </div>
      )}

      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-gray-500 mb-1">Style</p>
      <label className="text-xs font-medium text-gray-600 block mb-1">Text Alignment</label>
      <Select value={lbl.contentAlign || 'center'} onChange={(e) => setLblKey('contentAlign', e.target.value)} className="mb-3">
        {CONTENT_ALIGNS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>

      <label className="text-xs font-medium text-gray-600 block mb-1">Border</label>
      <Select value={lbl.borderStyle || 'solid'} onChange={(e) => setLblKey('borderStyle', e.target.value)} className="mb-3">
        {BORDER_STYLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>

      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs text-gray-500 mb-1">Background</p>
          <input type="color" value={lbl.backgroundColor || '#ffffff'} onChange={(e) => setLblKey('backgroundColor', e.target.value)}
            className="w-full h-9 border border-gray-300 rounded-md cursor-pointer p-0.5" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-500 mb-1">Text Color</p>
          <input type="color" value={lbl.textColor || '#000000'} onChange={(e) => setLblKey('textColor', e.target.value)}
            className="w-full h-9 border border-gray-300 rounded-md cursor-pointer p-0.5" />
        </div>
      </div>
    </div>
  );
}
